import { Exception } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { File, Path } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonElement, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { char, int } from "@tsonic/core/types.js";
import { DocsMountConfig, NavItem } from "./models.ts";
import { splitUrlSuffix } from "./url.ts";

const normalizeSlashes = (path: string): string => path.replace("\\", "/");

const isExternalUrl = (url: string): boolean => {
  const lower = url.trim().toLowerInvariant();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("//");
};

const isMarkdownPath = (path: string): boolean => {
  const lower = path.trim().toLowerInvariant();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
};

const normalizeRelativePath = (baseDirKey: string, targetPath: string): string | undefined => {
  const base = baseDirKey.trim();
  const start = new List<string>();
  if (base !== "") {
    const baseParts = base.split("/");
    for (let i = 0; i < baseParts.length; i++) {
      const seg = baseParts[i]!.trim();
      if (seg !== "") start.add(seg);
    }
  }

  const target = normalizeSlashes(targetPath.trim());
  const parts = target.split("/");

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!;
    const seg = raw.trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (start.count === 0) return undefined;
      start.removeAt(start.count - 1);
      continue;
    }
    start.add(seg);
  }

  const arr = start.toArray();
  if (arr.length === 0) return "";
  let out = arr[0]!;
  for (let i = 1; i < arr.length; i++) out += "/" + arr[i]!;
  return out;
};

const computeGitHubBlobUrl = (mount: DocsMountConfig, repoRelPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash: char = "/";
  const repo = mount.repoUrl.trim().trimEnd(slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const rel = repoRelPath.trim().trimStart(slash);
  if (rel === "") return undefined;
  return `${repo}/blob/${branch}/${rel}`;
};

const tryGetRouteUrl = (routesByRelPathLower: Dictionary<string, string>, key: string): string | undefined => {
  let v = "";
  const ok = routesByRelPathLower.tryGetValue(key, v);
  return ok ? v : undefined;
};

const resolveMarkdownNavLink = (
  mount: DocsMountConfig,
  navDirKey: string,
  linkTarget: string,
  routesByRelPathLower: Dictionary<string, string>,
): string | undefined => {
  const targetRaw = linkTarget.trim();
  if (targetRaw === "") return undefined;
  if (isExternalUrl(targetRaw)) return targetRaw;
  if (targetRaw.startsWith("#")) return targetRaw;

  const split = splitUrlSuffix(targetRaw);
  const pathPart = split.path.trim();
  const suffix = split.suffix;
  if (pathPart === "") return undefined;

  const slash: char = "/";
  const repoPathRaw = mount.repoPath;
  let repoPath = "";
  if (repoPathRaw !== undefined && repoPathRaw.trim() !== "") {
    repoPath = repoPathRaw.trim().trimStart(slash).trimEnd(slash);
  }
  const hasRepoPath = repoPath !== "";
  let resolvedRel: string | undefined = undefined;

  if (pathPart.startsWith("/")) {
    resolvedRel = pathPart.trimStart(slash);
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

  const key = resolvedRel.toLowerInvariant();
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
  readonly title: string;
  readonly target: string;

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
  const title = line.substring(open + 1, mid - (open + 1)).trim();
  const target = line.substring(mid + 2, close - (mid + 2)).trim();
  if (title === "" || target === "") return undefined;
  return new InlineLink(title, target);
};

class NavGroupBuild {
  readonly title: string;
  readonly order: int;
  readonly children: List<NavItem>;

  constructor(title: string, order: int) {
    this.title = title;
    this.order = order;
    this.children = new List<NavItem>();
  }
}

const parseTocMarkdown = (
  mount: DocsMountConfig,
  markdown: string,
  navDirKey: string,
  routesByRelPathLower: Dictionary<string, string>,
): NavItem[] => {
  const lines = markdown.replaceLineEndings("\n").split("\n");

  let inToc = false;
  const groups = new List<NavGroupBuild>();
  const rootItems = new List<NavItem>();
  let currentGroup: NavGroupBuild | undefined = undefined;
  let order: int = 1;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "") continue;

    const lower = line.toLowerInvariant();

    if (!inToc) {
      if (lower === "## table of contents") inToc = true;
      continue;
    }

    if (line.startsWith("## ") && lower !== "## table of contents") break;

    if (line.startsWith("### ")) {
      const title = line.substring(4).trim();
      if (title !== "") {
        currentGroup = new NavGroupBuild(title, order);
        groups.add(currentGroup);
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

    if (currentGroup !== undefined) currentGroup.children.add(item);
    else rootItems.add(item);
  }

  const out = new List<NavItem>();

  const groupArr = groups.toArray();
  for (let i = 0; i < groupArr.length; i++) {
    const g = groupArr[i]!;
    const groupItem = new NavItem(g.title, "", g.children.toArray(), true, false, g.order);
    out.add(groupItem);
  }

  const rootArr = rootItems.toArray();
  for (let i = 0; i < rootArr.length; i++) out.add(rootArr[i]!);

  return out.toArray();
};

const parseNavJson = (
  mount: DocsMountConfig,
  navDirKey: string,
  jsonText: string,
  routesByRelPathLower: Dictionary<string, string>,
): NavItem[] => {
  const doc = JsonDocument.parse(jsonText);
  const root = doc.rootElement;

  let hasItems = false;
  let itemsEl: JsonElement = root;
  if (root.valueKind === JsonValueKind.array) {
    hasItems = true;
    itemsEl = root;
  } else if (root.valueKind === JsonValueKind.object_) {
    const props = root.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      if (p.name.toLowerInvariant() === "items") {
        hasItems = true;
        itemsEl = p.value;
        break;
      }
    }
  }

  doc.dispose();

  if (!hasItems) {
    const empty: NavItem[] = [];
    return empty;
  }

  return parseNavJsonItems(mount, navDirKey, routesByRelPathLower, itemsEl);
};

function parseNavJsonItems(
  mount: DocsMountConfig,
  navDirKey: string,
  routesByRelPathLower: Dictionary<string, string>,
  el: JsonElement,
): NavItem[] {
  if (el.valueKind !== JsonValueKind.array) {
    const empty: NavItem[] = [];
    return empty;
  }

  const items = new List<NavItem>();
  const it = el.enumerateArray().getEnumerator();
  let order: int = 1;
  while (it.moveNext()) {
    const cur = it.current;
    if (cur.valueKind !== JsonValueKind.object_) continue;

    let title: string | undefined = undefined;
    let url: string | undefined = undefined;
    let path: string | undefined = undefined;
    let hasChildren = false;
    let childrenEl: JsonElement = cur;

    const props = cur.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      const k = p.name.toLowerInvariant();
      const v = p.value;
      if (k === "title" && v.valueKind === JsonValueKind.string_) title = v.getString();
      else if (k === "url" && v.valueKind === JsonValueKind.string_) url = v.getString();
      else if (k === "path" && v.valueKind === JsonValueKind.string_) path = v.getString();
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

    items.add(new NavItem(title, finalUrl, children, children.length > 0, false, order));
    order++;
  }

  return items.toArray();
}

const joinUrlPath = (parts: string[]): string => {
  if (parts.length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += "/" + parts[i]!;
  return out;
};

export const loadMountNav = (mount: DocsMountConfig, routesByRelPathLower: Dictionary<string, string>): NavItem[] => {
  const navRaw = mount.navPath !== undefined && mount.navPath.trim() !== "" ? mount.navPath.trim() : "README.md";
  const navFile = Path.isPathRooted(navRaw) ? navRaw : Path.combine(mount.sourceDir, navRaw);
  if (!File.exists(navFile)) {
    const empty: NavItem[] = [];
    return empty;
  }

  const rel = normalizeSlashes(Path.getRelativePath(mount.sourceDir, navFile));
  if (rel === "" || rel.startsWith("..")) {
    throw new Exception(`Mount nav must be inside sourceDir: ${navFile}`);
  }

  const parts = rel.split("/");
  const dirParts = new List<string>();
  for (let i = 0; i < parts.length - 1; i++) dirParts.add(parts[i]!);
  const navDirKey = joinUrlPath(dirParts.toArray());

  const text = File.readAllText(navFile);

  if (navFile.toLowerInvariant().endsWith(".json")) {
    return parseNavJson(mount, navDirKey, text, routesByRelPathLower);
  }

  return parseTocMarkdown(mount, text, navDirKey, routesByRelPathLower);
};
