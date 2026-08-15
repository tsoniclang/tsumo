import { writeFileSync } from "node:fs";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { listFilesRecursive, readBinaryFile } from "../fs.js";
import { compareText } from "../utils/strings.js";
import { parseImageDimensions } from "./image-dimensions.js";
import { resizeImageResource } from "./image-provider.js";
import {
  isImageResourceExtension,
  resourceMatchesMediaType,
  resourceMediaTypeForExtension,
} from "./media-types.js";
import { Resource, ResourceData } from "./models.js";
import {
  normalizeResourceRelativePath,
  normalizeResourceSlashes,
  resolveContainedResourcePath,
} from "./paths.js";
import { resourceGlobMatches } from "./glob.js";
import { compileSassResource } from "./sass-provider.js";
import { buildJavaScriptResource, JavaScriptBuildOptions } from "./javascript-provider.js";
import {
  concatenateResources,
  copyResource,
  createStringResource,
  fingerprintResource,
  minifyResource,
} from "./transforms.js";

const sortResourcePaths = (paths: string[]): void => {
  for (let leftIndex = 0; leftIndex < paths.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex++) {
      const left = paths[leftIndex]!;
      const right = paths[rightIndex]!;
      if (compareText(normalizeResourceSlashes(left), normalizeResourceSlashes(right)) <= 0) continue;
      paths[leftIndex] = right;
      paths[rightIndex] = left;
    }
  }
};

const sortResourcesByIdentity = (resources: Resource[]): void => {
  for (let leftIndex = 0; leftIndex < resources.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < resources.length; rightIndex++) {
      const left = resources[leftIndex]!;
      const right = resources[rightIndex]!;
      if (compareText(left.id, right.id) <= 0) continue;
      resources[leftIndex] = right;
      resources[rightIndex] = left;
    }
  }
};

export class ResourceManager {
  siteDir: string;
  themeDir: string | undefined;
  outputDir: string;
  siteAssetsDir: string;
  themeAssetsDir: string | undefined;
  cache: Map<string, Resource>;
  siteAssetFiles: string[];
  themeAssetFiles: string[];

  constructor(siteDir: string, themeDir: string | undefined, outputDir: string) {
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.siteAssetsDir = Path.Combine(siteDir, "assets");
    this.themeAssetsDir = themeDir === undefined ? undefined : Path.Combine(themeDir, "assets");
    this.cache = new Map<string, Resource>();
    this.siteAssetFiles = listFilesRecursive(this.siteAssetsDir, "*");
    sortResourcePaths(this.siteAssetFiles);
    const themeAssetsDir = this.themeAssetsDir;
    this.themeAssetFiles = themeAssetsDir === undefined ? [] : listFilesRecursive(themeAssetsDir, "*");
    sortResourcePaths(this.themeAssetFiles);
  }

  resolveAssetFullPath(relativePath: string): string | undefined {
    const normalized = normalizeResourceRelativePath(relativePath);
    if (normalized === "") return undefined;
    const sitePath = resolveContainedResourcePath(this.siteAssetsDir, normalized);
    if (File.Exists(sitePath)) return sitePath;

    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir === undefined) return undefined;
    const themePath = resolveContainedResourcePath(themeAssetsDir, normalized);
    return File.Exists(themePath) ? themePath : undefined;
  }

  get(relativePath: string): Resource | undefined {
    const normalized = normalizeResourceRelativePath(relativePath);
    if (normalized === "") return undefined;
    const identity = `get:${normalized}`;
    const fullPath = this.resolveAssetFullPath(normalized);
    if (fullPath === undefined) return undefined;
    return this.loadFile(identity, fullPath, normalized);
  }

  loadFile(identity: string, fullPath: string, outputRelPath: string): Resource {
    const cached = this.cache.get(identity);
    if (cached !== undefined) return cached;
    if (!File.Exists(fullPath)) {
      throw createTsumoError("TSUMO_RESOURCE_SOURCE_MISSING", `Resource source file does not exist: ${fullPath}`);
    }
    const bytes = readBinaryFile(fullPath);
    const extension = (Path.GetExtension(fullPath) ?? "").toLowerCase();
    const mediaType = resourceMediaTypeForExtension(extension);
    let width: int32 = 0;
    let height: int32 = 0;
    if (isImageResourceExtension(extension)) {
      const dimensions = parseImageDimensions(bytes);
      if (dimensions !== undefined) {
        width = dimensions.width;
        height = dimensions.height;
      }
    }

    const resource = new Resource(
      identity,
      fullPath,
      true,
      outputRelPath,
      bytes,
      undefined,
      new ResourceData(""),
      mediaType,
      width,
      height,
    );
    this.cache.set(identity, resource);
    return resource;
  }

  getMatch(pattern: string): Resource | undefined {
    const normalized = normalizeResourceRelativePath(pattern);
    if (normalized === "") return undefined;
    if (!normalized.includes("*")) return this.get(normalized);

    for (let index = 0; index < this.siteAssetFiles.length; index++) {
      const fullPath = this.siteAssetFiles[index]!;
      const relativePath = normalizeResourceSlashes(Path.GetRelativePath(this.siteAssetsDir, fullPath));
      if (resourceGlobMatches(normalized, relativePath)) return this.get(relativePath);
    }
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let index = 0; index < this.themeAssetFiles.length; index++) {
        const fullPath = this.themeAssetFiles[index]!;
        const relativePath = normalizeResourceSlashes(Path.GetRelativePath(themeAssetsDir, fullPath));
        if (resourceGlobMatches(normalized, relativePath)) return this.get(relativePath);
      }
    }
    return undefined;
  }

  match(pattern: string): Resource[] {
    const normalized = normalizeResourceRelativePath(pattern);
    const result: Resource[] = [];
    if (normalized === "") return result;
    const selected = new Map<string, boolean>();

    for (let index = 0; index < this.siteAssetFiles.length; index++) {
      const fullPath = this.siteAssetFiles[index]!;
      const relativePath = normalizeResourceSlashes(Path.GetRelativePath(this.siteAssetsDir, fullPath));
      if (!resourceGlobMatches(normalized, relativePath)) continue;
      const resource = this.get(relativePath);
      if (resource === undefined) continue;
      result.push(resource);
      selected.set(relativePath, true);
    }

    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let index = 0; index < this.themeAssetFiles.length; index++) {
        const fullPath = this.themeAssetFiles[index]!;
        const relativePath = normalizeResourceSlashes(Path.GetRelativePath(themeAssetsDir, fullPath));
        if (selected.has(relativePath) || !resourceGlobMatches(normalized, relativePath)) continue;
        const resource = this.get(relativePath);
        if (resource !== undefined) result.push(resource);
      }
    }
    sortResourcesByIdentity(result);
    return result;
  }

  byType(mediaType: string): Resource[] {
    const result: Resource[] = [];
    const selected = new Map<string, boolean>();
    for (let index = 0; index < this.siteAssetFiles.length; index++) {
      const fullPath = this.siteAssetFiles[index]!;
      const relativePath = normalizeResourceSlashes(Path.GetRelativePath(this.siteAssetsDir, fullPath));
      const resource = this.get(relativePath);
      if (resource === undefined || !resourceMatchesMediaType(resource.mediaType, mediaType)) continue;
      result.push(resource);
      selected.set(relativePath, true);
    }

    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let index = 0; index < this.themeAssetFiles.length; index++) {
        const fullPath = this.themeAssetFiles[index]!;
        const relativePath = normalizeResourceSlashes(Path.GetRelativePath(themeAssetsDir, fullPath));
        if (selected.has(relativePath)) continue;
        const resource = this.get(relativePath);
        if (resource !== undefined && resourceMatchesMediaType(resource.mediaType, mediaType)) {
          result.push(resource);
        }
      }
    }
    sortResourcesByIdentity(result);
    return result;
  }

  concat(targetPath: string, resources: Resource[]): Resource {
    return this.cacheResource(concatenateResources(targetPath, resources));
  }

  fromString(name: string, content: string): Resource {
    return this.cacheResource(createStringResource(name, content));
  }

  minify(resource: Resource): Resource {
    return this.cacheResource(minifyResource(resource));
  }

  fingerprint(resource: Resource): Resource {
    return this.cacheResource(fingerprintResource(resource));
  }

  copy(targetPath: string, resource: Resource): Resource {
    return this.cacheResource(copyResource(targetPath, resource));
  }

  sassCompile(resource: Resource): Resource {
    const identity = `${resource.id}|sass`;
    const cached = this.cache.get(identity);
    if (cached !== undefined) return cached;
    const loadPaths: string[] = [];
    const sourcePath = resource.sourcePath;
    if (sourcePath !== undefined) {
      const sourceDirectory = Path.GetDirectoryName(sourcePath);
      if (sourceDirectory !== undefined && sourceDirectory !== "") loadPaths.push(sourceDirectory);
    }
    loadPaths.push(this.siteAssetsDir);
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) loadPaths.push(themeAssetsDir);
    return this.cacheResource(compileSassResource(resource, loadPaths));
  }

  javascriptBuild(resource: Resource, options: JavaScriptBuildOptions): Resource {
    const identity = `${resource.id}|js-build:${options.cacheKey()}`;
    const cached = this.cache.get(identity);
    if (cached !== undefined) return cached;
    return this.cacheResource(buildJavaScriptResource(resource, options));
  }

  resize(resource: Resource, specification: string): Resource {
    const identity = `${resource.id}|resize:${specification}`;
    const cached = this.cache.get(identity);
    if (cached !== undefined) return cached;
    return this.cacheResource(resizeImageResource(resource, specification));
  }

  ensurePublished(resource: Resource): void {
    if (!resource.publishable) return;
    const outputRelPath = resource.outputRelPath;
    if (outputRelPath === undefined) {
      throw createTsumoError("TSUMO_RESOURCE_OUTPUT_PATH_MISSING", "Publishable resource has no output path");
    }
    const normalized = normalizeResourceRelativePath(outputRelPath);
    if (normalized === "") {
      throw createTsumoError("TSUMO_RESOURCE_OUTPUT_PATH_MISSING", "Publishable resource has an empty output path");
    }
    const destination = resolveContainedResourcePath(this.outputDir, normalized);
    const directory = Path.GetDirectoryName(destination);
    if (directory !== undefined && directory !== "") Directory.CreateDirectory(directory);
    writeFileSync(destination, resource.bytes);
  }

  cacheResource(resource: Resource): Resource {
    const cached = this.cache.get(resource.id);
    if (cached !== undefined) return cached;
    this.cache.set(resource.id, resource);
    return resource;
  }
}
