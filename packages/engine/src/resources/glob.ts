import type { int32 } from "@tsonic/core/types.js";
import { normalizeResourceRelativePath } from "./paths.js";

const resourceSegmentMatches = (pattern: string, segment: string): boolean => {
  if (pattern === "*") return true;
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === segment;

  const parts = pattern.split("*");
  let position = 0;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (part === "") continue;
    const found = segment.indexOf(part, position);
    if (found < 0) return false;
    if (index === 0 && !pattern.startsWith("*") && found !== 0) return false;
    position = found + part.length;
  }
  return pattern.endsWith("*") || position === segment.length;
};

const splitGlobSegments = (value: string): string[] => {
  const normalized = normalizeResourceRelativePath(value);
  if (normalized === "") return [];
  return normalized.split("/");
};

const resourceGlobMatchesAt = (
  patternSegments: string[],
  pathSegments: string[],
  patternIndex: int32,
  pathIndex: int32,
): boolean => {
  if (patternIndex >= patternSegments.length) return pathIndex >= pathSegments.length;
  const pattern = patternSegments[patternIndex]!;
  if (pattern === "**") {
    for (let index = pathIndex; index <= pathSegments.length; index++) {
      if (resourceGlobMatchesAt(patternSegments, pathSegments, patternIndex + 1, index)) return true;
    }
    return false;
  }
  if (pathIndex >= pathSegments.length) return false;
  if (!resourceSegmentMatches(pattern, pathSegments[pathIndex]!)) return false;
  return resourceGlobMatchesAt(patternSegments, pathSegments, patternIndex + 1, pathIndex + 1);
};

export const resourceGlobMatches = (pattern: string, path: string): boolean =>
  resourceGlobMatchesAt(splitGlobSegments(pattern), splitGlobSegments(path), 0, 0);
