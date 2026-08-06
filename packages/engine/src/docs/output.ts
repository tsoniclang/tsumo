import { resolve } from "node:path";
import { createTsumoError } from "../diagnostics.js";
import { pathContainsOrEquals } from "../utils/paths.js";

export class DocsOutputClaims {
  sourcesByOutputPath: Map<string, string>;

  constructor() {
    this.sourcesByOutputPath = new Map<string, string>();
  }

  add(outputRelPath: string, sourcePath: string): void {
    const key = outputRelPath.toLowerCase();
    const previous = this.sourcesByOutputPath.get(key);
    if (previous !== undefined) {
      throw createTsumoError(
        "TSUMO_DOCS_ROUTE_CONFLICT",
        `Docs sources '${previous}' and '${sourcePath}' both map to '${outputRelPath}'`,
      );
    }
    this.sourcesByOutputPath.set(key, sourcePath);
  }
}

export const resolveDocsOutputPath = (outputRoot: string, relativePath: string): string => {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || (normalized.length >= 2 && normalized[1] === ":")) {
    throw createTsumoError("TSUMO_DOCS_OUTPUT_PATH_ABSOLUTE", `Docs output path must be relative: ${relativePath}`);
  }
  const root = resolve(outputRoot);
  const candidate = resolve(root, normalized);
  if (!pathContainsOrEquals(root, candidate)) {
    throw createTsumoError("TSUMO_DOCS_OUTPUT_PATH_ESCAPES_ROOT", `Docs output path escapes its root: ${relativePath}`);
  }
  return candidate;
};

export const docsOutputPathForPermalink = (permalink: string): string => {
  const normalized = permalink.replaceAll("\\", "/");
  const trimmed = normalized.startsWith("/") ? normalized.substring(1) : normalized;
  const withoutTrailingSlash = trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length - 1) : trimmed;
  return withoutTrailingSlash === "" ? "index.html" : withoutTrailingSlash + "/index.html";
};
