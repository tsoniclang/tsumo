import type { int32 } from "@tsonic/core/types.js";
import { PageContext, SiteContext } from "../../models.js";
import { replaceText } from "../../utils/strings.js";
import { trimEndCharacter, trimSlashes, trimStartCharacter } from "./serialization.js";

export const normalizeRelPath = (raw: string): string => {
  const normalized = replaceText(raw, "\\", "/");
  const parts = normalized.split("/");
  const outParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!.trim();
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (outParts.length > 0) outParts.pop();
      continue;
    }
    outParts.push(p);
  }
  const arr = outParts;
  let out = "";
  for (let i = 0; i < arr.length; i++) out = out === "" ? arr[i]! : out + "/" + arr[i]!;
  return out;
};

export const segmentMatch = (pattern: string, segment: string): boolean => {
  if (pattern === "*") return true;
  const star = pattern.indexOf("*");
  if (star < 0) return pattern === segment;

  const parts = pattern.split("*");
  let pos = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p === "") continue;
    const idx = segment.indexOf(p, pos);
    if (idx < 0) return false;
    if (i === 0 && !pattern.startsWith("*") && idx !== 0) return false;
    pos = idx + p.length;
  }
  if (!pattern.endsWith("*") && pos !== segment.length) return false;
  return true;
};

export const splitGlobSegments = (raw: string): string[] => {
  const slash = "/";
  const normalized = trimStartCharacter(replaceText(raw.trim(), "\\", "/"), slash);
  if (normalized === "") {
    const empty: string[] = [];
    return empty;
  }
  return normalized.split("/");
};

export const globMatchAt = (patSegs: string[], pathSegs: string[], pi: int32, si: int32): boolean => {
  if (pi >= patSegs.length) return si >= pathSegs.length;
  const p = patSegs[pi]!;
  if (p === "**") {
    for (let i = si; i <= pathSegs.length; i++) {
      if (globMatchAt(patSegs, pathSegs, pi + 1, i)) return true;
    }
    return false;
  }
  if (si >= pathSegs.length) return false;
  if (!segmentMatch(p, pathSegs[si]!)) return false;
  return globMatchAt(patSegs, pathSegs, pi + 1, si + 1);
};

export const globMatch = (patternRaw: string, pathRaw: string): boolean => {
  const patSegs = splitGlobSegments(patternRaw);
  const pathSegs = splitGlobSegments(pathRaw);
  return globMatchAt(patSegs, pathSegs, 0, 0);
};

export const resolvePageRef = (page: PageContext, ref: string): string => {
  const raw = ref.trim();
  if (raw === "" || raw === "/") return "";
  if (raw.startsWith("/")) return trimSlashes(raw);
  const pageFile = page.File;
  const base = pageFile !== undefined ? pageFile.Dir : trimSlashes(page.relPermalink);
  const combined =
    base === "" ? raw : trimEndCharacter(base, "/") + "/" + trimStartCharacter(raw, "/");
  return normalizeRelPath(combined);
};

export const tryGetPage = (site: SiteContext, pathRaw: string): PageContext | undefined => {
  const trimmed = pathRaw.trim();
  if (trimmed === "" || trimmed === "/") return site.home;
  const needle = trimSlashes(trimmed);
  if (needle === "") return site.home;
  let candidates: PageContext[] = site.pages;
  if (site.allPages.length > 0) candidates = site.allPages;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]!;
    if (trimSlashes(p.relPermalink) === needle) return p;
    if (p.slug === needle) return p;
  }
  return undefined;
};
