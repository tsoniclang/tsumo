import type { JsValue } from "@tsonic/core/types.js";
import { basename, isAbsolute, join, resolve } from "@tsonic/nodejs/path.js";
import { fileExists, readTextFile } from "../fs.ts";
import { DocsMountConfig, DocsSiteConfig } from "./models.ts";
import { ensureLeadingSlash, ensureTrailingSlash } from "../utils/text.ts";
import { trimEndChar, trimStartChar } from "../utils/strings.ts";

export class LoadedDocsConfig {
  readonly path: string;
  readonly config: DocsSiteConfig;

  constructor(path: string, config: DocsSiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const readString = (root: JsValue, propName: string): string | undefined => {
  if (root === null || typeof root !== "object" || Array.isArray(root)) return undefined;
  const entries = Object.entries(root);
  const propNameLower = propName.toLowerCase();
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]!;
    if (key.toLowerCase() === propNameLower && typeof value === "string") {
      return value;
    }
  }
  return undefined;
};

const readBool = (root: JsValue, propName: string): boolean | undefined => {
  if (root === null || typeof root !== "object" || Array.isArray(root)) return undefined;
  const entries = Object.entries(root);
  const propNameLower = propName.toLowerCase();
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]!;
    if (key.toLowerCase() === propNameLower && typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
};

const normalizePrefix = (raw: string): string => ensureTrailingSlash(ensureLeadingSlash(raw.trim()));

const resolveSourceDir = (siteDir: string, raw: string): string => {
  if (raw.trim() === "") throw new Error("Docs mount `source` cannot be empty");
  return isAbsolute(raw) ? resolve(raw) : resolve(join(siteDir, raw));
};

const parseMounts = (siteDir: string, root: JsValue): DocsMountConfig[] => {
  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  const entries = Object.entries(root);
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i]!;
    if (key.toLowerCase() !== "mounts" || !Array.isArray(value)) continue;
    const mountsValue = value as JsValue[];

    const mounts: DocsMountConfig[] = [];
    for (let j = 0; j < mountsValue.length; j++) {
      const mount = mountsValue[j];
      if (mount === null || typeof mount !== "object" || Array.isArray(mount)) continue;

      let name: string | undefined;
      let source: string | undefined;
      let prefix: string | undefined;
      let repoUrl: string | undefined;
      let repoBranch = "main";
      let repoPath: string | undefined;
      let navPath: string | undefined;

      const mountEntries = Object.entries(mount);
      for (let k = 0; k < mountEntries.length; k++) {
        const [mountKey, mountValue] = mountEntries[k]!;
        const lower = mountKey.toLowerCase();
        if (lower === "name" && typeof mountValue === "string") name = mountValue;
        else if (lower === "source" && typeof mountValue === "string") source = mountValue;
        else if (lower === "prefix" && typeof mountValue === "string") prefix = mountValue;
        else if ((lower === "repo" || lower === "repourl") && typeof mountValue === "string") repoUrl = mountValue;
        else if ((lower === "branch" || lower === "repobranch") && typeof mountValue === "string") repoBranch = mountValue;
        else if ((lower === "repopath" || lower === "subdir") && typeof mountValue === "string") repoPath = mountValue;
        else if ((lower === "nav" || lower === "navpath") && typeof mountValue === "string") navPath = mountValue;
      }

      if (source === undefined || prefix === undefined) continue;
      const sourceDir = resolveSourceDir(siteDir, source);
      const urlPrefix = normalizePrefix(prefix);
      const slash = "/";
      const fallbackName = urlPrefix === "/" ? "Docs" : trimEndChar(trimStartChar(urlPrefix, slash), slash);
      const mountName = name === undefined || name.trim() === "" ? fallbackName : name;
      const finalRepoPath = repoPath ?? (repoUrl !== undefined ? basename(sourceDir) : undefined);

      mounts.push(new DocsMountConfig(mountName, sourceDir, urlPrefix, repoUrl, repoBranch, finalRepoPath, navPath));
    }

    return mounts;
  }

  return [];
};

export const loadDocsConfig = (siteDir: string): LoadedDocsConfig | undefined => {
  const candidate = join(siteDir, "tsumo.docs.json");
  if (!fileExists(candidate)) return undefined;

  const root = JSON.parse(readTextFile(candidate));
  const mounts = parseMounts(siteDir, root);
  if (mounts.length === 0) throw new Error("tsumo.docs.json has no mounts");

  const config = new DocsSiteConfig(
    mounts,
    readBool(root, "strictLinks") ?? false,
    readBool(root, "search") ?? true,
    readString(root, "searchFile") ?? "search.json",
    readString(root, "homeMount"),
    readString(root, "siteName") ?? "Docs",
  );

  return new LoadedDocsConfig(candidate, config);
};
