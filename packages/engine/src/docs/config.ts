import { isAbsolute, join, resolve } from "node:path";
import { createTsumoError, TsumoError } from "../diagnostics.js";
import { fileExists, readTextFile } from "../fs.js";
import { JsonArray, JsonBool, JsonObject, JsonString, JsonValue, jsonObject, parseJson } from "../utils/json.js";
import { trimEndChar, trimStartChar } from "../utils/strings.js";
import { ensureLeadingSlash, ensureTrailingSlash } from "../utils/text.js";
import { DocsMountConfig, DocsSiteConfig } from "./models.js";

export class LoadedDocsConfig {
  path: string;
  config: DocsSiteConfig;

  constructor(path: string, config: DocsSiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const docsConfigError = (code: string, message: string, path: string): TsumoError =>
  createTsumoError(code, message, path);

const assertUniqueProperties = (value: JsonObject, context: string, path: string): void => {
  const seen = new Map<string, string>();
  for (let index = 0; index < value.properties.length; index++) {
    const property = value.properties[index]!;
    const key = property.key.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw docsConfigError(
        "TSUMO_DOCS_CONFIG_DUPLICATE_PROPERTY",
        `${context} contains duplicate properties '${previous}' and '${property.key}'`,
        path,
      );
    }
    seen.set(key, property.key);
  }
};

const optionalString = (root: JsonObject, name: string, context: string, path: string): string | undefined => {
  const value = root.getCaseInsensitive(name);
  if (value === undefined) return undefined;
  if (!(value instanceof JsonString)) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_TYPE", `${context}.${name} must be a string`, path);
  }
  return (value as JsonString).value;
};

const optionalBool = (root: JsonObject, name: string, context: string, path: string): boolean | undefined => {
  const value = root.getCaseInsensitive(name);
  if (value === undefined) return undefined;
  if (!(value instanceof JsonBool)) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_TYPE", `${context}.${name} must be a boolean`, path);
  }
  return (value as JsonBool).value;
};

const requiredString = (root: JsonObject, name: string, context: string, path: string): string => {
  const value = optionalString(root, name, context, path);
  if (value === undefined) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_REQUIRED", `${context}.${name} is required`, path);
  }
  return value;
};

const rejectUnknownProperties = (
  root: JsonObject,
  allowedNames: string[],
  context: string,
  path: string,
): void => {
  const allowed = new Map<string, boolean>();
  for (let index = 0; index < allowedNames.length; index++) allowed.set(allowedNames[index]!.toLowerCase(), true);
  for (let index = 0; index < root.properties.length; index++) {
    const name = root.properties[index]!.key;
    if (allowed.has(name.toLowerCase())) continue;
    throw docsConfigError("TSUMO_DOCS_CONFIG_UNKNOWN_PROPERTY", `${context} contains unknown property '${name}'`, path);
  }
};

const normalizePrefix = (raw: string): string => ensureTrailingSlash(ensureLeadingSlash(raw.trim()));

const resolveSourceDir = (siteDir: string, raw: string, path: string): string => {
  if (raw.trim() === "") {
    throw docsConfigError("TSUMO_DOCS_CONFIG_SOURCE_EMPTY", "Docs mount source cannot be empty", path);
  }
  return isAbsolute(raw) ? resolve(raw) : resolve(join(siteDir, raw));
};

const parseMount = (siteDir: string, value: JsonValue, index: number, path: string): DocsMountConfig => {
  const context = `mounts[${index}]`;
  if (!(value instanceof JsonObject)) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_TYPE", `${context} must be an object`, path);
  }
  const object = value as JsonObject;
  assertUniqueProperties(object, context, path);
  rejectUnknownProperties(
    object,
    ["name", "source", "prefix", "repoUrl", "repoBranch", "repoPath", "navPath"],
    context,
    path,
  );

  const sourceDir = resolveSourceDir(siteDir, requiredString(object, "source", context, path), path);
  const urlPrefix = normalizePrefix(requiredString(object, "prefix", context, path));
  const configuredName = optionalString(object, "name", context, path);
  const fallbackName = urlPrefix === "/" ? "Docs" : trimEndChar(trimStartChar(urlPrefix, "/"), "/");
  const name = configuredName === undefined || configuredName.trim() === "" ? fallbackName : configuredName.trim();
  const repoUrl = optionalString(object, "repoUrl", context, path);
  const repoBranch = optionalString(object, "repoBranch", context, path) ?? "main";
  const repoPath = optionalString(object, "repoPath", context, path);
  const navPath = optionalString(object, "navPath", context, path);
  return new DocsMountConfig(name, sourceDir, urlPrefix, repoUrl, repoBranch, repoPath, navPath);
};

const parseMounts = (siteDir: string, root: JsonObject, path: string): DocsMountConfig[] => {
  const value = root.getCaseInsensitive("mounts");
  if (!(value instanceof JsonArray)) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_TYPE", "mounts must be an array", path);
  }
  const array = value as JsonArray;
  if (array.items.length === 0) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_REQUIRED", "mounts must contain at least one mount", path);
  }

  const mounts: DocsMountConfig[] = [];
  const names = new Map<string, boolean>();
  const prefixes = new Map<string, boolean>();
  for (let index = 0; index < array.items.length; index++) {
    const mount = parseMount(siteDir, array.items[index]!, index, path);
    const nameKey = mount.name.toLowerCase();
    if (names.has(nameKey)) {
      throw docsConfigError("TSUMO_DOCS_CONFIG_DUPLICATE_MOUNT", `Duplicate docs mount name: ${mount.name}`, path);
    }
    const prefixKey = mount.urlPrefix.toLowerCase();
    if (prefixes.has(prefixKey)) {
      throw docsConfigError("TSUMO_DOCS_CONFIG_DUPLICATE_MOUNT", `Duplicate docs mount prefix: ${mount.urlPrefix}`, path);
    }
    names.set(nameKey, true);
    prefixes.set(prefixKey, true);
    mounts.push(mount);
  }
  return mounts;
};

export const loadDocsConfig = (siteDir: string): LoadedDocsConfig | undefined => {
  const candidate = join(siteDir, "tsumo.docs.json");
  if (!fileExists(candidate)) return undefined;

  const parsedRoot = jsonObject(parseJson(readTextFile(candidate), candidate));
  if (parsedRoot === undefined) {
    throw docsConfigError("TSUMO_DOCS_CONFIG_TYPE", "tsumo.docs.json root must be an object", candidate);
  }
  const root = parsedRoot as JsonObject;
  assertUniqueProperties(root, "tsumo.docs.json", candidate);
  rejectUnknownProperties(
    root,
    ["siteName", "homeMount", "strictLinks", "search", "searchFile", "mounts"],
    "tsumo.docs.json",
    candidate,
  );

  const mounts = parseMounts(siteDir, root, candidate);
  const generateSearchIndex = optionalBool(root, "search", "tsumo.docs.json", candidate) ?? true;
  const searchIndexFileName = optionalString(root, "searchFile", "tsumo.docs.json", candidate) ?? "search.json";
  if (generateSearchIndex && searchIndexFileName.trim() === "") {
    throw docsConfigError("TSUMO_DOCS_CONFIG_SEARCH_FILE_EMPTY", "searchFile cannot be empty when search is enabled", candidate);
  }

  const config = new DocsSiteConfig(
    mounts,
    optionalBool(root, "strictLinks", "tsumo.docs.json", candidate) ?? false,
    generateSearchIndex,
    searchIndexFileName,
    optionalString(root, "homeMount", "tsumo.docs.json", candidate),
    optionalString(root, "siteName", "tsumo.docs.json", candidate) ?? "Docs",
  );
  return new LoadedDocsConfig(candidate, config);
};
