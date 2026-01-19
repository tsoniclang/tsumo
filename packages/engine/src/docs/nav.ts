import { Exception } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { File, Path } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonElement, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { char, int } from "@tsonic/core/types.js";
import { DocsMountConfig, NavItem } from "./models.ts";
import { splitUrlSuffix } from "./url.ts";

const normalizeSlashes = (path: string): string => path.Replace("\\", "/");

const isExternalUrl = (url: string): boolean => {
  const lower = url.Trim().ToLowerInvariant();
  return lower.StartsWith("http://") || lower.StartsWith("https://") || lower.StartsWith("mailto:") || lower.StartsWith("tel:") || lower.StartsWith("//");
};

const isMarkdownPath = (path: string): boolean => {
  const lower = path.Trim().ToLowerInvariant();
  return lower.EndsWith(".md") || lower.EndsWith(".markdown");
};

const normalizeRelativePath = (baseDirKey: string, targetPath: string): string | undefined => {
  const base = baseDirKey.Trim();
  const start = new List<string>();
  if (base !== "") {
    const baseParts = base.Split("/");
    for (let i = 0; i < baseParts.Length; i++) {
      const seg = baseParts[i]!.Trim();
      if (seg !== "") start.Add(seg);
    }
  }

  const target = normalizeSlashes(targetPath.Trim());
  const parts = target.Split("/");

  for (let i = 0; i < parts.Length; i++) {
    const raw = parts[i]!;
    const seg = raw.Trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (start.Count === 0) return undefined;
      start.RemoveAt(start.Count - 1);
      continue;
    }
    start.Add(seg);
  }

  const arr = start.ToArray();
  if (arr.Length === 0) return "";
  let out = arr[0]!;
  for (let i = 1; i < arr.Length; i++) out += "/" + arr[i]!;
  return out;
};

const computeGitHubBlobUrl = (mount: DocsMountConfig, repoRelPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash: char = "/";
  const repo = mount.repoUrl.Trim().TrimEnd(slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.Trim() === "" ? "main" : mount.repoBranch.Trim();
  const rel = repoRelPath.Trim().TrimStart(slash);
  if (rel === "") return undefined;
  return `${repo}/blob/${branch}/${rel}`;
};

const tryGetRouteUrl = (routesByRelPathLower: Dictionary<string, string>, key: string): string | undefined => {
  let v = "";
  const ok = routesByRelPathLower.TryGetValue(key, v);
  return ok ? v : undefined;
};

const resolveMarkdownNavLink = (
  mount: DocsMountConfig,
  navDirKey: string,
  linkTarget: string,
  routesByRelPathLower: Dictionary<string, string>,
): string | undefined => {
  const targetRaw = linkTarget.Trim();
  if (targetRaw === "") return undefined;
  if (isExternalUrl(targetRaw)) return targetRaw;
  if (targetRaw.StartsWith("#")) return targetRaw;

  const split = splitUrlSuffix(targetRaw);
  const pathPart = split.path.Trim();
  const suffix = split.suffix;
  if (pathPart === "") return undefined;

  const slash: char = "/";
  const repoPathRaw = mount.repoPath;
  let repoPath = "";
  if (repoPathRaw !== undefined && repoPathRaw.Trim() !== "") {
    repoPath = repoPathRaw.Trim().TrimStart(slash).TrimEnd(slash);
  }
  const hasRepoPath = repoPath !== "";
  let resolvedRel: string | undefined = undefined;

  if (pathPart.StartsWith("/")) {
    resolvedRel = pathPart.TrimStart(slash);
  } else {
    resolvedRel = normalizeRelativePath(navDirKey, pathPart);
  }

  if (resolvedRel === undefined) {
    if (!hasRepoPath) return undefined;
    const baseDir = navDirKey.Trim() === "" ? repoPath : `${repoPath}/${navDirKey}`;
    const repoResolvedEscape = normalizeRelativePath(baseDir, pathPart);
    if (repoResolvedEscape === undefined) return undefined;
    const ghUrlEscape = computeGitHubBlobUrl(mount, repoResolvedEscape);
    return ghUrlEscape !== undefined ? ghUrlEscape + suffix : undefined;
  }

  if (!isMarkdownPath(resolvedRel)) {
    // Non-markdown links are left as-is (relative).
    return targetRaw;
  }

  const key = resolvedRel.ToLowerInvariant();
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
  const open = line.IndexOf("[");
  const mid = line.IndexOf("](");
  if (open < 0 || mid < 0 || mid <= open) return undefined;
  const close = line.IndexOf(")", mid + 2);
  if (close < 0) return undefined;
  const title = line.Substring(open + 1, mid - (open + 1)).Trim();
  const target = line.Substring(mid + 2, close - (mid + 2)).Trim();
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
  const lines = markdown.ReplaceLineEndings("\n").Split("\n");

  let inToc = false;
  const groups = new List<NavGroupBuild>();
  const rootItems = new List<NavItem>();
  let currentGroup: NavGroupBuild | undefined = undefined;
  let order: int = 1;

  for (let i = 0; i < lines.Length; i++) {
    const raw = lines[i]!;
    const line = raw.Trim();
    if (line === "") continue;

    const lower = line.ToLowerInvariant();

    if (!inToc) {
      if (lower === "## table of contents") inToc = true;
      continue;
    }

    if (line.StartsWith("## ") && lower !== "## table of contents") break;

    if (line.StartsWith("### ")) {
      const title = line.Substring(4).Trim();
      if (title !== "") {
        currentGroup = new NavGroupBuild(title, order);
        groups.Add(currentGroup);
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

    if (currentGroup !== undefined) currentGroup.children.Add(item);
    else rootItems.Add(item);
  }

  const out = new List<NavItem>();

  const groupArr = groups.ToArray();
  for (let i = 0; i < groupArr.Length; i++) {
    const g = groupArr[i]!;
    const groupItem = new NavItem(g.title, "", g.children.ToArray(), true, false, g.order);
    out.Add(groupItem);
  }

  const rootArr = rootItems.ToArray();
  for (let i = 0; i < rootArr.Length; i++) out.Add(rootArr[i]!);

  return out.ToArray();
};

const parseNavJson = (
  mount: DocsMountConfig,
  navDirKey: string,
  jsonText: string,
  routesByRelPathLower: Dictionary<string, string>,
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
        if (p.Name.ToLowerInvariant() === "items") {
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
  routesByRelPathLower: Dictionary<string, string>,
  el: JsonElement,
): NavItem[] {
  if (el.ValueKind !== JsonValueKind.Array) {
    const empty: NavItem[] = [];
    return empty;
  }

  const items = new List<NavItem>();
  const it = el.EnumerateArray().GetEnumerator();
  let order: int = 1;
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
      const k = p.Name.ToLowerInvariant();
      const v = p.Value;
      if (k === "title" && v.ValueKind === JsonValueKind.String) title = v.GetString();
      else if (k === "url" && v.ValueKind === JsonValueKind.String) url = v.GetString();
      else if (k === "path" && v.ValueKind === JsonValueKind.String) path = v.GetString();
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

    items.Add(new NavItem(title, finalUrl, children, children.Length > 0, false, order));
    order++;
  }

  return items.ToArray();
}

const joinUrlPath = (parts: string[]): string => {
  if (parts.Length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.Length; i++) out += "/" + parts[i]!;
  return out;
};

export const loadMountNav = (mount: DocsMountConfig, routesByRelPathLower: Dictionary<string, string>): NavItem[] => {
  const navRaw = mount.navPath !== undefined && mount.navPath.Trim() !== "" ? mount.navPath.Trim() : "README.md";
  const navFile = Path.IsPathRooted(navRaw) ? navRaw : Path.Combine(mount.sourceDir, navRaw);
  if (!File.Exists(navFile)) {
    const empty: NavItem[] = [];
    return empty;
  }

  const rel = normalizeSlashes(Path.GetRelativePath(mount.sourceDir, navFile));
  if (rel === "" || rel.StartsWith("..")) {
    throw new Exception(`Mount nav must be inside sourceDir: ${navFile}`);
  }

  const parts = rel.Split("/");
  const dirParts = new List<string>();
  for (let i = 0; i < parts.Length - 1; i++) dirParts.Add(parts[i]!);
  const navDirKey = joinUrlPath(dirParts.ToArray());

  const text = File.ReadAllText(navFile);

  if (navFile.ToLowerInvariant().EndsWith(".json")) {
    return parseNavJson(mount, navDirKey, text, routesByRelPathLower);
  }

  return parseTocMarkdown(mount, text, navDirKey, routesByRelPathLower);
};
