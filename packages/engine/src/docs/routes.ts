import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { listFilesRecursive } from "../fs.js";
import { compareText, substringCount, trimEndChar, trimStartChar } from "../utils/strings.js";
import { combineUrlPath } from "../utils/url-path.js";
import { DocsMountConfig } from "./models.js";

export class DocsAssetRoute {
  sourcePath: string;
  outputRelPath: string;

  constructor(sourcePath: string, outputRelPath: string) {
    this.sourcePath = sourcePath;
    this.outputRelPath = outputRelPath;
  }
}

export class DocsMarkdownRoute {
  mount: DocsMountConfig;
  sourcePath: string;
  relPath: string;
  dirKey: string;
  fileName: string;
  isIndex: boolean;
  relPermalink: string;
  outputRelPath: string;

  constructor(
    mount: DocsMountConfig,
    sourcePath: string,
    relPath: string,
    dirKey: string,
    fileName: string,
    isIndex: boolean,
    relPermalink: string,
    outputRelPath: string,
  ) {
    this.mount = mount;
    this.sourcePath = sourcePath;
    this.relPath = relPath;
    this.dirKey = dirKey;
    this.fileName = fileName;
    this.isIndex = isIndex;
    this.relPermalink = relPermalink;
    this.outputRelPath = outputRelPath;
  }
}

export class DocsMountRoutes {
  markdown: DocsMarkdownRoute[];
  assets: DocsAssetRoute[];

  constructor(markdown: DocsMarkdownRoute[], assets: DocsAssetRoute[]) {
    this.markdown = markdown;
    this.assets = assets;
  }
}

export const docsMountPrefixSegments = (urlPrefix: string): string[] => {
  const trimmed = trimEndChar(trimStartChar(urlPrefix.trim(), "/"), "/");
  if (trimmed === "") return [];
  const segments = trimmed.split("/");
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes(":") ||
      segment.includes("?") ||
      segment.includes("#")
    ) {
      throw createTsumoError("TSUMO_DOCS_PREFIX_INVALID", `Invalid docs URL prefix: ${urlPrefix}`);
    }
  }
  return segments;
};

const normalizeSlashes = (path: string): string => path.replaceAll("\\", "/");

const sortPaths = (paths: string[]): void => {
  paths.sort((left: string, right: string) => compareText(normalizeSlashes(left), normalizeSlashes(right)));
};

export const withoutMarkdownExtension = (fileName: string): string =>
  fileName.toLowerCase().endsWith(".md")
    ? substringCount(fileName, 0, fileName.length - 3)
    : fileName;

const isIndexMarkdownFile = (fileName: string): boolean => {
  const value = fileName.toLowerCase();
  return value === "_index.md" || value === "index.md" || value === "readme.md";
};

const joinSegments = (segments: string[]): string => segments.join("/");

const outputPathForSegments = (segments: string[]): string =>
  segments.length === 0 ? "index.html" : joinSegments(segments) + "/index.html";

const assertUniqueOutput = (
  outputs: Map<string, string>,
  outputRelPath: string,
  sourcePath: string,
): void => {
  const key = outputRelPath.toLowerCase();
  const previous = outputs.get(key);
  if (previous !== undefined) {
    throw createTsumoError(
      "TSUMO_DOCS_ROUTE_CONFLICT",
      `Docs sources '${previous}' and '${sourcePath}' both map to '${outputRelPath}'`,
    );
  }
  outputs.set(key, sourcePath);
};

export const discoverDocsMountRoutes = (mount: DocsMountConfig): DocsMountRoutes => {
  if (!Directory.Exists(mount.sourceDir)) {
    throw createTsumoError("TSUMO_DOCS_MOUNT_MISSING", `Docs mount not found: ${mount.sourceDir}`);
  }

  const prefixSegments = docsMountPrefixSegments(mount.urlPrefix);
  const markdown: DocsMarkdownRoute[] = [];
  const assets: DocsAssetRoute[] = [];
  const outputs = new Map<string, string>();
  const files = listFilesRecursive(mount.sourceDir, "*");
  sortPaths(files);

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const sourcePath = files[fileIndex]!;
    const relPath = normalizeSlashes(Path.GetRelativePath(mount.sourceDir, sourcePath));
    if (relPath === "" || relPath === ".." || relPath.startsWith("../")) {
      throw createTsumoError("TSUMO_DOCS_SOURCE_PATH_INVALID", `Docs source is outside its mount: ${sourcePath}`);
    }
    const relativeSegments = relPath.split("/");
    for (let segmentIndex = 0; segmentIndex < relativeSegments.length; segmentIndex++) {
      const segment = relativeSegments[segmentIndex]!;
      if (segment === "" || segment === "." || segment === "..") {
        throw createTsumoError("TSUMO_DOCS_SOURCE_PATH_INVALID", `Invalid docs source path: ${relPath}`);
      }
    }

    const outputSegments: string[] = [];
    for (let index = 0; index < prefixSegments.length; index++) outputSegments.push(prefixSegments[index]!);
    if (!sourcePath.toLowerCase().endsWith(".md")) {
      for (let index = 0; index < relativeSegments.length; index++) outputSegments.push(relativeSegments[index]!);
      const outputRelPath = joinSegments(outputSegments);
      assertUniqueOutput(outputs, outputRelPath, sourcePath);
      assets.push(new DocsAssetRoute(sourcePath, outputRelPath));
      continue;
    }

    const fileName = relativeSegments[relativeSegments.length - 1]!;
    const directorySegments: string[] = [];
    for (let index = 0; index < relativeSegments.length - 1; index++) {
      directorySegments.push(relativeSegments[index]!);
    }
    const isIndex = isIndexMarkdownFile(fileName);
    const urlSegments: string[] = [];
    for (let index = 0; index < directorySegments.length; index++) urlSegments.push(directorySegments[index]!);
    if (!isIndex) urlSegments.push(withoutMarkdownExtension(fileName));
    for (let index = 0; index < urlSegments.length; index++) outputSegments.push(urlSegments[index]!);

    const urlParts: string[] = [mount.urlPrefix];
    for (let index = 0; index < urlSegments.length; index++) urlParts.push(urlSegments[index]!);
    const outputRelPath = outputPathForSegments(outputSegments);
    assertUniqueOutput(outputs, outputRelPath, sourcePath);
    markdown.push(new DocsMarkdownRoute(
      mount,
      sourcePath,
      relPath,
      joinSegments(directorySegments),
      fileName,
      isIndex,
      combineUrlPath(urlParts),
      outputRelPath,
    ));
  }
  return new DocsMountRoutes(markdown, assets);
};
