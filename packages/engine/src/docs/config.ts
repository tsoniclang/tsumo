import { basename, isAbsolute, join, resolve } from "@tsonic/nodejs/path.js";
import { fileExists, readTextFile } from "../fs.ts";
import { DocsMountConfig, DocsSiteConfig } from "./models.ts";
import { ensureLeadingSlash, ensureTrailingSlash } from "../utils/text.ts";
import { trimEndChar, trimStartChar } from "../utils/strings.ts";
import { JsonArray, JsonObject, jsonBool, jsonString, parseJson } from "../utils/json.ts";

export class LoadedDocsConfig {
  path: string;
  config: DocsSiteConfig;

  constructor(path: string, config: DocsSiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const readString = (root: JsonObject, propName: string): string | undefined =>
  jsonString(root.getCaseInsensitive(propName));

const readBool = (root: JsonObject, propName: string): boolean | undefined =>
  jsonBool(root.getCaseInsensitive(propName));

const normalizePrefix = (raw: string): string => ensureTrailingSlash(ensureLeadingSlash(raw.trim()));

const resolveSourceDir = (siteDir: string, raw: string): string => {
  if (raw.trim() === "") throw new Error("Docs mount `source` cannot be empty");
  return isAbsolute(raw) ? resolve(raw) : resolve(join(siteDir, raw));
};

const parseMounts = (siteDir: string, root: JsonObject): DocsMountConfig[] => {
  const mountsNode = root.getCaseInsensitive("mounts");
  if (!(mountsNode instanceof JsonArray)) return [];

  const mounts: DocsMountConfig[] = [];
  for (let j = 0; j < mountsNode.items.length; j++) {
    const mount = mountsNode.items[j];
    if (!(mount instanceof JsonObject)) continue;

    let name: string | undefined;
    let source: string | undefined;
    let prefix: string | undefined;
    let repoUrl: string | undefined;
    let repoBranch = "main";
    let repoPath: string | undefined;
    let navPath: string | undefined;

    for (let k = 0; k < mount.properties.length; k++) {
      const property = mount.properties[k]!;
      const mountValue = jsonString(property.value);
      if (mountValue === undefined) continue;

      const lower = property.key.toLowerCase();
      if (lower === "name") name = mountValue;
      else if (lower === "source") source = mountValue;
      else if (lower === "prefix") prefix = mountValue;
      else if (lower === "repo" || lower === "repourl") repoUrl = mountValue;
      else if (lower === "branch" || lower === "repobranch") repoBranch = mountValue;
      else if (lower === "repopath" || lower === "subdir") repoPath = mountValue;
      else if (lower === "nav" || lower === "navpath") navPath = mountValue;
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
};

export const loadDocsConfig = (siteDir: string): LoadedDocsConfig | undefined => {
  const candidate = join(siteDir, "tsumo.docs.json");
  if (!fileExists(candidate)) return undefined;

  const rootValue = parseJson(readTextFile(candidate));
  if (!(rootValue instanceof JsonObject)) throw new Error("tsumo.docs.json root must be an object");
  const root = rootValue;
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
