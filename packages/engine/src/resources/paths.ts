import { isAbsolute, resolve, sep } from "node:path";
import { createTsumoError } from "../diagnostics.js";
import { pathContainsOrEquals } from "../utils/paths.js";
import { replaceText, substringCount, substringFrom } from "../utils/strings.js";

export class ResourcePathParts {
  directory: string;
  fileName: string;

  constructor(directory: string, fileName: string) {
    this.directory = directory;
    this.fileName = fileName;
  }
}

export class ResourceFileNameParts {
  baseName: string;
  extension: string;

  constructor(baseName: string, extension: string) {
    this.baseName = baseName;
    this.extension = extension;
  }
}

export const normalizeResourceSlashes = (path: string): string => path.replaceAll("\\", "/");

export const normalizeResourceRelativePath = (path: string): string => {
  let normalized = normalizeResourceSlashes(path.trim());
  while (normalized.startsWith("/")) normalized = substringFrom(normalized, 1);
  const driveQualified = normalized.length >= 2 && substringCount(normalized, 1, 1) === ":";
  if (isAbsolute(normalized) || driveQualified) {
    throw createTsumoError("TSUMO_RESOURCE_PATH_ABSOLUTE", `Resource path must be source-root relative: ${path}`);
  }

  const segments = normalized.split("/");
  const accepted: string[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw createTsumoError("TSUMO_RESOURCE_PATH_ESCAPES_ROOT", `Resource path escapes its root: ${path}`);
    }
    if (segment.includes("\u0000")) {
      throw createTsumoError("TSUMO_RESOURCE_PATH_INVALID", "Resource path contains a null character");
    }
    accepted.push(segment);
  }
  return accepted.join("/");
};

export const resourcePathToOsPath = (relativePath: string): string =>
  replaceText(relativePath, "/", `${sep}`);

export const resolveContainedResourcePath = (root: string, relativePath: string): string => {
  const normalized = normalizeResourceRelativePath(relativePath);
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, resourcePathToOsPath(normalized));
  if (!pathContainsOrEquals(rootPath, candidate)) {
    throw createTsumoError("TSUMO_RESOURCE_PATH_ESCAPES_ROOT", `Resource path escapes its root: ${relativePath}`);
  }
  return candidate;
};

export const splitResourcePath = (relativePath: string): ResourcePathParts => {
  const normalized = normalizeResourceRelativePath(relativePath);
  const index = normalized.lastIndexOf("/");
  if (index < 0) return new ResourcePathParts("", normalized);
  return new ResourcePathParts(
    substringCount(normalized, 0, index + 1),
    substringFrom(normalized, index + 1),
  );
};

export const splitResourceFileName = (fileName: string): ResourceFileNameParts => {
  const index = fileName.lastIndexOf(".");
  if (index < 0) return new ResourceFileNameParts(fileName, "");
  return new ResourceFileNameParts(
    substringCount(fileName, 0, index),
    substringFrom(fileName, index),
  );
};
