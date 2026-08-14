import { File, Path } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonElement, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { char, int32 } from "@tsonic/core/types.js";
import { DocsMountConfig, NavItem } from "./models.js";
import { createTsumoError } from "../diagnostics.js";
import { splitUrlSuffix } from "./url.js";
import { replaceLineEndings, substringCount, substringFrom, trimEndChar, trimStartChar } from "../utils/strings.js";

const normalizeSlashes = (path: string): string => path.replaceAll("\\", "/");

const isExternalUrl = (url: string): boolean => {
  const lower = url.trim().toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("//");
};

const isMarkdownPath = (path: string): boolean => {
  const lower = path.trim().toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
};

const normalizeRelativePath = (baseDirKey: string, targetPath: string): string | undefined => {
  const base = baseDirKey.trim();
  const start: string[] = [];
  if (base !== "") {
    const baseParts = base.split("/");
    for (let i = 0; i < baseParts.length; i++) {
      const seg = baseParts[i]!.trim();
      if (seg !== "") start.push(seg);
    }
  }

  const target = normalizeSlashes(targetPath.trim());
  const parts = target.split("/");

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!;
    const seg = raw.trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (start.length === 0) return undefined;
      start.pop();
      continue;
    }
    start.push(seg);
  }

  const arr = start;
  if (arr.length === 0) return "";
  let out = arr[0]!;
  for (let i = 1; i < arr.length; i++) out += "/" + arr[i]!;
  return out;
};

const computeGitHubBlobUrl = (mount: DocsMountConfig, repoRelPath: string): string | undefined => {
  const repoUrl = mount.repoUrl;
  if (repoUrl === undefined) return undefined;
  const slash = "/";
  const repo = trimEndChar(repoUrl.trim(), slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const rel = trimStartChar(repoRelPath.trim(), slash);
  if (rel === "") return undefined;
  return `${repo}/blob/${branch}/${rel}`;
};

const tryGetRouteUrl = (routesByRelPathLower: Map<string, string>, key: string): string | undefined => {
  return routesByRelPathLower.get(key);
};

const resolveMarkdownNavLink = (
  mount: DocsMountConfig,
  navDirKey: string,
  linkTarget: string,
  routesByRelPathLower: Map<string, string>,
): string | undefined => {
  const targetRaw = linkTarget.trim();
  if (targetRaw === "") return undefined;
  if (isExternalUrl(targetRaw)) return targetRaw;
  if (targetRaw.startsWith("#")) return targetRaw;

  const split = splitUrlSuffix(targetRaw);
  const pathPart = split.path.trim();
  const suffix = split.suffix;
  if (pathPart === "") return undefined;

  const slash = "/";
  const repoPathRaw = mount.repoPath;
  let repoPath = "";
  if (repoPathRaw !== undefined && repoPathRaw.trim() !== "") {
    repoPath = trimEndChar(trimStartChar(repoPathRaw.trim(), slash), slash);
  }
  const hasRepoPath = repoPath !== "";
  let resolvedRel: string | undefined = undefined;

  if (pathPart.startsWith("/")) {
    resolvedRel = trimStartChar(pathPart, slash);
  } else {
    resolvedRel = normalizeRelativePath(navDirKey, pathPart);
  }

  if (resolvedRel === undefined) {
    if (!hasRepoPath) return undefined;
    const baseDir = navDirKey.trim() === "" ? repoPath : `${repoPath}/${navDirKey}`;
    const repoResolvedEscape = normalizeRelativePath(baseDir, pathPart);
    if (repoResolvedEscape === undefined) return undefined;
    const ghUrlEscape = computeGitHubBlobUrl(mount, repoResolvedEscape);
    return ghUrlEscape !== undefined ? ghUrlEscape + suffix : undefined;
  }

  if (!isMarkdownPath(resolvedRel)) {
    // Non-markdown links are left as-is (relative).
    return targetRaw;
  }

  const key = resolvedRel.toLowerCase();
  const mapped = tryGetRouteUrl(routesByRelPathLower, key);
  if (mapped !== undefined) return mapped + suffix;

  // Fallback to GitHub if we can.
  if (!hasRepoPath) return undefined;
  const repoResolvedFallback = normalizeRelativePath(repoPath, resolvedRel);
  if (repoResolvedFallback === undefined) return undefined;
  const ghUrlFallback = computeGitHubBlobUrl(mount, repoResolvedFallback);
  return ghUrlFallback !== undefined ? ghUrlFallback + suffix : undefined;
};

class InlineLink {
  title: string;
  target: string;

  constructor(title: string, target: string) {
    this.title = title;
    this.target = target;
  }
}

const parseInlineMarkdownLink = (line: string): InlineLink | undefined => {
  const open = line.indexOf("[");
  const mid = line.indexOf("](");
  if (open < 0 || mid < 0 || mid <= open) return undefined;
  const close = line.indexOf(")", mid + 2);
  if (close < 0) return undefined;
  const title = substringCount(line, open + 1, mid - (open + 1)).trim();
  const target = substringCount(line, mid + 2, close - (mid + 2)).trim();
  if (title === "" || target === "") return undefined;
  return new InlineLink(title, target);
};

class NavGroupBuild {
  title: string;
  order: int32;
  children: NavItem[];

  constructor(title: string, order: int32) {
    this.title = title;
    this.order = order;
    const empty: NavItem[] = [];
    this.children = empty;
  }
}

const parseTocMarkdown = (
  mount: DocsMountConfig,
  markdown: string,
  navDirKey: string,
  routesByRelPathLower: Map<string, string>,
): NavItem[] => {
  const lines = replaceLineEndings(markdown, "\n").split("\n");

  let inToc = false;
  const groups: NavGroupBuild[] = [];
  const rootItems: NavItem[] = [];
  let currentGroup: NavGroupBuild | undefined = undefined;
  let order: int32 = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "") continue;

    const lower = line.toLowerCase();

    if (!inToc) {
      if (lower === "## table of contents") inToc = true;
      continue;
    }

    if (line.startsWith("## ") && lower !== "## table of contents") break;

    if (line.startsWith("### ")) {
      const title = substringFrom(line, 4).trim();
      if (title !== "") {
        currentGroup = new NavGroupBuild(title, order);
        groups.push(currentGroup);
        order++;
      }
      continue;
    }

    const parsed = parseInlineMarkdownLink(line);
    if (parsed === undefined) continue;

    const resolved = resolveMarkdownNavLink(mount, navDirKey, parsed.target, routesByRelPathLower);
    if (resolved === undefined) continue;

    const empty: NavItem[] = [];
    const item = new NavItem(parsed.title, resolved, empty, false, false, order);
    order++;

    if (currentGroup !== undefined) currentGroup.children.push(item);
    else rootItems.push(item);
  }

  const out: NavItem[] = [];

  const groupArr = groups;
  for (let i = 0; i < groupArr.length; i++) {
    const g = groupArr[i]!;
    const groupItem = new NavItem(g.title, "", g.children, true, false, g.order);
    out.push(groupItem);
  }

  const rootArr = rootItems;
  for (let i = 0; i < rootArr.length; i++) out.push(rootArr[i]!);

  return out;
};

const parseNavJson = (
  mount: DocsMountConfig,
  navDirKey: string,
  jsonText: string,
  routesByRelPathLower: Map<string, string>,
): NavItem[] => {
  const doc = JsonDocument.Parse(jsonText);
  try {
    const root = doc.RootElement;

    let hasItems = false;
    let itemsEl: JsonElement = root;
    if (root.ValueKind === JsonValueKind.Array) {
      hasItems = true;
      itemsEl = root;
    } else if (root.ValueKind === JsonValueKind.Object) {
      const props = root.EnumerateObject().GetEnumerator();
      while (props.MoveNext()) {
        const p = props.Current;
        if (p.Name.toLowerCase() === "items") {
          hasItems = true;
          itemsEl = p.Value;
          break;
        }
      }
    }

    if (!hasItems) {
      const empty: NavItem[] = [];
      return empty;
    }

    return parseNavJsonItems(mount, navDirKey, routesByRelPathLower, itemsEl);
  } finally {
    doc.Dispose();
  }
};

function parseNavJsonItems(
  mount: DocsMountConfig,
  navDirKey: string,
  routesByRelPathLower: Map<string, string>,
  el: JsonElement,
): NavItem[] {
  if (el.ValueKind !== JsonValueKind.Array) {
    const empty: NavItem[] = [];
    return empty;
  }

  const items: NavItem[] = [];
  const it = el.EnumerateArray().GetEnumerator();
  let order: int32 = 1;
  while (it.MoveNext()) {
    const cur = it.Current;
    if (cur.ValueKind !== JsonValueKind.Object) continue;

    let title: string | undefined = undefined;
    let url: string | undefined = undefined;
    let path: string | undefined = undefined;
    let hasChildren = false;
    let childrenEl: JsonElement = cur;

    const props = cur.EnumerateObject().GetEnumerator();
    while (props.MoveNext()) {
      const p = props.Current;
      const k = p.Name.toLowerCase();
      const v = p.Value;
      if (k === "title" && v.ValueKind === JsonValueKind.String) {
        const value = v.GetString();
        if (value !== null) title = value;
      } else if (k === "url" && v.ValueKind === JsonValueKind.String) {
        const value = v.GetString();
        if (value !== null) url = value;
      } else if (k === "path" && v.ValueKind === JsonValueKind.String) {
        const value = v.GetString();
        if (value !== null) path = value;
      }
      else if (k === "children") {
        hasChildren = true;
        childrenEl = v;
      }
    }

    const emptyChildren: NavItem[] = [];
    const children = hasChildren ? parseNavJsonItems(mount, navDirKey, routesByRelPathLower, childrenEl) : emptyChildren;

    let finalUrl: string | undefined = undefined;
    if (url !== undefined) {
      finalUrl = url;
    } else if (path !== undefined) {
      finalUrl = resolveMarkdownNavLink(mount, navDirKey, path, routesByRelPathLower);
    }

    if (title === undefined || finalUrl === undefined) continue;

    items.push(new NavItem(title, finalUrl, children, children.length > 0, false, order));
    order++;
  }

  return items;
}

const joinUrlPath = (parts: string[]): string => {
  if (parts.length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += "/" + parts[i]!;
  return out;
};

export const loadMountNav = (mount: DocsMountConfig, routesByRelPathLower: Map<string, string>): NavItem[] => {
  const navPath = mount.navPath;
  const navRaw = navPath !== undefined && navPath.trim() !== "" ? navPath.trim() : "README.md";
  const navFile = Path.IsPathRooted(navRaw) ? navRaw : Path.Combine(mount.sourceDir, navRaw);
  if (!File.Exists(navFile)) {
    const empty: NavItem[] = [];
    return empty;
  }

  const rel = normalizeSlashes(Path.GetRelativePath(mount.sourceDir, navFile));
  if (rel === "" || rel.startsWith("..")) {
    throw createTsumoError("TSUMO_DOCS_NAV_OUTSIDE_MOUNT", `Mount nav must be inside sourceDir: ${navFile}`, navFile);
  }

  const parts = rel.split("/");
  const dirParts: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) dirParts.push(parts[i]!);
  const navDirKey = joinUrlPath(dirParts);

  const text = File.ReadAllText(navFile);

  if (navFile.toLowerCase().endsWith(".json")) {
    return parseNavJson(mount, navDirKey, text, routesByRelPathLower);
  }

  return parseTocMarkdown(mount, text, navDirKey, routesByRelPathLower);
};
