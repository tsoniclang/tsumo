import { copyFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createTsumoError } from "../diagnostics.js";
import { ensureDir, listFilesRecursive, writeTextFile } from "../fs.js";
import { pathContainsOrEquals } from "../utils/paths.js";
import { compareSitePaths, joinSitePath, normalizeSitePath, splitSitePath } from "./site-routes.js";
import type { int32 } from "@tsonic/core/types.js";

type AssetLayer = "theme-static" | "site-static" | "bundle" | "docs-asset";

class OutputClaim {
  relativePath: string;
  owner: string;
  assetLayer: AssetLayer | undefined;

  constructor(relativePath: string, owner: string, assetLayer: AssetLayer | undefined) {
    this.relativePath = relativePath;
    this.owner = owner;
    this.assetLayer = assetLayer;
  }
}

class FileSiteOutput {
  sourcePath: string;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
  }
}

const normalizeOutputPath = (relativePath: string): string => {
  const normalized = normalizeSitePath(relativePath);
  if (normalized === "" || normalized.startsWith("/") || isAbsolute(normalized) || (normalized.length >= 2 && normalized[1] === ":")) {
    throw createTsumoError("TSUMO_OUTPUT_PATH_ABSOLUTE", `Site output path must be relative: ${relativePath}`);
  }
  const segments = splitSitePath(normalized);
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (segment === "" || segment === "." || segment === "..") {
      throw createTsumoError("TSUMO_OUTPUT_PATH_ESCAPES_ROOT", `Site output path is not canonical: ${relativePath}`);
    }
  }
  return joinSitePath(segments);
};

const combineOutputPath = (prefix: string, relativePath: string): string => {
  const normalizedRelativePath = normalizeOutputPath(relativePath);
  if (prefix.trim() === "") return normalizedRelativePath;
  return normalizeOutputPath(normalizeSitePath(prefix) + "/" + normalizedRelativePath);
};

const resolveOutputPath = (outputRoot: string, relativePath: string): string => {
  const root = resolve(outputRoot);
  const candidate = resolve(root, normalizeOutputPath(relativePath));
  if (!pathContainsOrEquals(root, candidate)) {
    throw createTsumoError("TSUMO_OUTPUT_PATH_ESCAPES_ROOT", `Site output path escapes its root: ${relativePath}`);
  }
  return candidate;
};

export class SiteOutputPlan {
  claimsByPath: Map<string, OutputClaim>;
  textByPath: Map<string, string>;
  filesByPath: Map<string, FileSiteOutput>;

  constructor() {
    this.claimsByPath = new Map<string, OutputClaim>();
    this.textByPath = new Map<string, string>();
    this.filesByPath = new Map<string, FileSiteOutput>();
  }

  addText(relativePath: string, content: string, owner: string): void {
    const outputPath = normalizeOutputPath(relativePath);
    const key = outputPath.toLowerCase();
    const previous = this.claimsByPath.get(key);
    if (previous !== undefined) this.throwConflict(outputPath, owner, previous);
    this.claimsByPath.set(key, new OutputClaim(outputPath, owner, undefined));
    this.textByPath.set(key, content);
  }

  addDefaultText(relativePath: string, content: string, owner: string): void {
    const outputPath = normalizeOutputPath(relativePath);
    const previous = this.claimsByPath.get(outputPath.toLowerCase());
    if (previous === undefined) {
      this.addText(outputPath, content, owner);
      return;
    }
    if (previous.assetLayer === "theme-static" || previous.assetLayer === "site-static") {
      return;
    }
    this.throwConflict(outputPath, owner, previous);
  }

  addAsset(relativePath: string, sourcePath: string, owner: string, layer: AssetLayer): void {
    const outputPath = normalizeOutputPath(relativePath);
    const key = outputPath.toLowerCase();
    const previous = this.claimsByPath.get(key);
    if (previous === undefined) {
      this.claimsByPath.set(key, new OutputClaim(outputPath, owner, layer));
      this.filesByPath.set(key, new FileSiteOutput(sourcePath));
      return;
    }
    if (previous.assetLayer === "theme-static" && layer === "site-static") {
      this.claimsByPath.set(key, new OutputClaim(outputPath, owner, layer));
      this.filesByPath.set(key, new FileSiteOutput(sourcePath));
      return;
    }
    this.throwConflict(outputPath, owner, previous);
  }

  addDirectory(sourceRoot: string, outputPrefix: string, owner: string, layer: AssetLayer): void {
    const files = listFilesRecursive(sourceRoot, "*");
    files.sort((left: string, right: string) => compareSitePaths(left, right));
    for (let index = 0; index < files.length; index++) {
      const sourcePath = files[index]!;
      const relativePath = normalizeSitePath(relative(sourceRoot, sourcePath));
      this.addAsset(combineOutputPath(outputPrefix, relativePath), sourcePath, owner, layer);
    }
  }

  generatedOutputCount(): int32 {
    let count: int32 = 0;
    for (const unused of this.textByPath.values()) count++;
    return count;
  }

  applyDeferredTemplateResults(results: Map<string, string>): void {
    if (results.size === 0) return;
    const resolvedPlacements = new Set<string>();
    const outputPaths = Array.from(this.textByPath.keys());
    for (let outputIndex = 0; outputIndex < outputPaths.length; outputIndex++) {
      const key = outputPaths[outputIndex]!;
      let content = this.textByPath.get(key);
      if (content === undefined) continue;
      for (const token of results.keys()) {
        const replacement = results.get(token);
        if (replacement === undefined) {
          throw createTsumoError("TSUMO_TEMPLATE_DEFER_RESULT_INVALID", "A deferred-template replacement disappeared");
        }
        const first = content.indexOf(token);
        if (first >= 0) {
          if (resolvedPlacements.has(token) || content.indexOf(token, first + token.length) >= 0) {
            throw createTsumoError(
              "TSUMO_TEMPLATE_DEFER_PLACEMENT_INVALID",
              "Each deferred-template placement must occur exactly once in planned output",
            );
          }
          resolvedPlacements.add(token);
          content = content.replaceAll(token, replacement);
        }
      }
      this.textByPath.set(key, content);
    }
    for (const token of results.keys()) {
      if (!resolvedPlacements.has(token)) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFER_PLACEMENT_INVALID",
          "Each deferred-template placement must occur exactly once in planned output",
        );
      }
    }
  }

  render(outputRoot: string): void {
    const keys = Array.from(this.claimsByPath.keys());
    keys.sort((left: string, right: string) => compareSitePaths(left, right));
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]!;
      const claim = this.claimsByPath.get(key);
      if (claim === undefined) {
        throw createTsumoError("TSUMO_OUTPUT_PLAN_INCONSISTENT", `Output claim '${key}' disappeared before rendering`);
      }
      const destination = resolveOutputPath(outputRoot, claim.relativePath);
      const text = this.textByPath.get(key);
      if (text !== undefined) {
        writeTextFile(destination, text);
        continue;
      }
      const file = this.filesByPath.get(key);
      if (file === undefined) {
        throw createTsumoError("TSUMO_OUTPUT_PLAN_INCONSISTENT", `Output claim '${key}' has no planned content`);
      }
      ensureDir(dirname(destination));
      copyFileSync(file.sourcePath, destination);
    }
  }

  throwConflict(relativePath: string, owner: string, previous: OutputClaim): never {
    throw createTsumoError(
      "TSUMO_OUTPUT_PATH_CONFLICT",
      `Output '${relativePath}' is claimed by both '${previous.owner}' and '${owner}'`,
    );
  }
}
