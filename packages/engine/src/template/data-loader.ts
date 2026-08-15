import { extname, isAbsolute, join, relative } from "node:path";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { dirExists, listFilesRecursive, readTextFile } from "../fs.js";
import type { ModuleMount } from "../models.js";
import { replaceText, trimEndChar, trimStartChar } from "../utils/strings.js";
import { parseTemplateDataText } from "./evaluation/structured-data.js";
import { DictValue, TemplateValue } from "./values.js";

class SelectedDataFile {
  semanticPath: string;
  sourcePath: string;
  format: string;

  constructor(semanticPath: string, sourcePath: string, format: string) {
    this.semanticPath = semanticPath;
    this.sourcePath = sourcePath;
    this.format = format;
  }
}

const dataFormat = (path: string): string | undefined => {
  const extension = extname(path).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  if (extension === ".toml") return "toml";
  if (extension === ".xml") return "xml";
  return undefined;
};

const normalizeDataPath = (path: string): string => replaceText(path, "\\", "/");

const collectDataLayer = (
  root: string,
  selected: Map<string, SelectedDataFile>,
): void => {
  if (!dirExists(root)) return;
  const files = listFilesRecursive(root, "*");
  const layer = new Map<string, SelectedDataFile>();
  for (let index: int32 = 0; index < files.length; index++) {
    const sourcePath = files[index]!;
    const format = dataFormat(sourcePath);
    if (format === undefined) continue;
    const relativePath = normalizeDataPath(relative(root, sourcePath));
    const extension = extname(relativePath);
    const semanticPath = relativePath.slice(0, relativePath.length - extension.length);
    const existing = layer.get(semanticPath);
    if (existing !== undefined) {
      throw createTsumoError(
        "TSUMO_DATA_IDENTITY_CONFLICT",
        `Data files '${existing.sourcePath}' and '${sourcePath}' define the same data identity '${semanticPath}'`,
        sourcePath,
      );
    }
    layer.set(semanticPath, new SelectedDataFile(semanticPath, sourcePath, format));
  }
  for (const file of layer.values()) selected.set(file.semanticPath, file);
};

const setDataPath = (
  root: DictValue,
  semanticPath: string,
  value: TemplateValue,
  sourcePath: string,
): void => {
  const segments = semanticPath.split("/");
  let current = root;
  for (let index: int32 = 0; index < segments.length - 1; index++) {
    const segment = segments[index]!;
    const existing = current.value.get(segment);
    if (existing === undefined) {
      const created = new DictValue(new Map<string, TemplateValue>());
      current.value.set(segment, created);
      current = created;
      continue;
    }
    if (!(existing instanceof DictValue)) {
      throw createTsumoError(
        "TSUMO_DATA_TREE_CONFLICT",
        `Data identity '${semanticPath}' conflicts with a data file at '${segments.slice(0, index + 1).join("/")}'`,
        sourcePath,
      );
    }
    current = existing as DictValue;
  }
  const name = segments[segments.length - 1]!;
  if (current.value.has(name)) {
    throw createTsumoError(
      "TSUMO_DATA_TREE_CONFLICT",
      `Data identity '${semanticPath}' is declared more than once`,
      sourcePath,
    );
  }
  current.value.set(name, value);
};

export const loadSiteData = (
  siteDir: string,
  themeDir: string | undefined,
  mounts: ModuleMount[] | undefined,
): DictValue => {
  const selected = new Map<string, SelectedDataFile>();
  if (themeDir !== undefined) collectDataLayer(join(themeDir as string, "data"), selected);

  if (mounts !== undefined) {
    for (let index: int32 = mounts.length - 1; index >= 0; index--) {
      const mount = mounts[index]!;
      const target = trimEndChar(trimStartChar(normalizeDataPath(mount.target), "/"), "/");
      if (target !== "data") continue;
      const root = isAbsolute(mount.source) ? mount.source : join(siteDir, mount.source);
      collectDataLayer(root, selected);
    }
  }

  collectDataLayer(join(siteDir, "data"), selected);
  const identities = Array.from(selected.keys());
  identities.sort();
  const root = new DictValue(new Map<string, TemplateValue>());
  for (let index: int32 = 0; index < identities.length; index++) {
    const identity = identities[index]!;
    const file = selected.get(identity);
    if (file === undefined) {
      throw createTsumoError("TSUMO_DATA_SELECTION_INCONSISTENT", `Selected data identity '${identity}' disappeared`);
    }
    const value = parseTemplateDataText(readTextFile(file.sourcePath), file.format, file.sourcePath);
    setDataPath(root, file.semanticPath, value, file.sourcePath);
  }
  return root;
};
