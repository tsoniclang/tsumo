import { statSync } from "@tsonic/nodejs/fs.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { char, int } from "@tsonic/core/types.js";
import { loadSiteConfig } from "../config.ts";
import { parseContent } from "../frontmatter.ts";
import { copyDirRecursive, deleteDirRecursive, ensureDir, readTextFile, writeTextFile } from "../fs.ts";
import { BuildEnvironment } from "../env.ts";
import { BuildRequest, BuildResult, PageContext, PageFile, SiteContext } from "../models.ts";
import { Markdown } from "markdig-types/Markdig.js";
import { markdownPipeline } from "../markdown.ts";
import { HtmlString } from "../utils/html.ts";
import { ensureTrailingSlash, humanizeSlug } from "../utils/text.ts";
import { combineUrl, renderWithBase, resolveThemeDir, selectTemplate } from "../build/layout.ts";
import { LoadedDocsConfig } from "./config.ts";
import { DocsMountConfig, DocsMountContext } from "./models.ts";
import { DocsLinkRewriteContext, renderDocsMarkdown } from "./markdown.ts";
import { loadMountNav } from "./nav.ts";
import { compareText, replaceText, substringCount, substringFrom, trimEndChar, trimStartChar } from "../utils/strings.ts";
import { ParamValue } from "../params.ts";

class SearchDoc {
  readonly title: string;
  readonly url: string;
  readonly mount: string;
  readonly text: string;

  constructor(title: string, url: string, mount: string, text: string) {
    this.title = title;
    this.url = url;
    this.mount = mount;
    this.text = text;
  }
}

const escapeJsonString = (input: string): string => {
  let s = input;
  s = replaceText(s, "\\", "\\\\");
  s = replaceText(s, "\"", "\\\"");
  s = replaceText(s, "\r", "\\r");
  s = replaceText(s, "\n", "\\n");
  s = replaceText(s, "\t", "\\t");
  return s;
};

const renderSearchIndexJson = (docs: SearchDoc[]): string => {
  const sb = new StringBuilder();
  sb.Append("[");
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    if (i > 0) sb.Append(",");
    sb.Append("{");
    sb.Append("\"title\":\"");
    sb.Append(escapeJsonString(d.title));
    sb.Append("\",\"url\":\"");
    sb.Append(escapeJsonString(d.url));
    sb.Append("\",\"mount\":\"");
    sb.Append(escapeJsonString(d.mount));
    sb.Append("\",\"text\":\"");
    sb.Append(escapeJsonString(d.text));
    sb.Append("\"}");
  }
  sb.Append("]");
  return sb.ToString();
};

class DocsMarkdownRoute {
  readonly mount: DocsMountConfig;
  readonly sourcePath: string;
  readonly relPath: string;
  readonly dirKey: string;
  readonly fileName: string;
  readonly isIndex: boolean;
  readonly urlSegments: string[];
  readonly outputSegments: string[];
  readonly relPermalink: string;
  readonly outputRelPath: string;

  constructor(
    mount: DocsMountConfig,
    sourcePath: string,
    relPath: string,
    dirKey: string,
    fileName: string,
    isIndex: boolean,
    urlSegments: string[],
    outputSegments: string[],
    relPermalink: string,
    outputRelPath: string,
  ) {
    this.mount = mount;
    this.sourcePath = sourcePath;
    this.relPath = relPath;
    this.dirKey = dirKey;
    this.fileName = fileName;
    this.isIndex = isIndex;
    this.urlSegments = urlSegments;
    this.outputSegments = outputSegments;
    this.relPermalink = relPermalink;
    this.outputRelPath = outputRelPath;
  }
}

const normalizeSlashes = (path: string): string => path.replaceAll("\\", "/");

const splitPath = (relativePath: string): string[] => normalizeSlashes(relativePath).split("/");

const joinUrlPath = (parts: string[]): string => {
  if (parts.length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += "/" + parts[i]!;
  return out;
};

const isIndexMarkdownFile = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return lower === "_index.md" || lower === "index.md" || lower === "readme.md";
};

const withoutMdExtension = (fileName: string): string => {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".md") ? substringCount(fileName, 0, fileName.length - 3) : fileName;
};

const mountPrefixSegments = (urlPrefix: string): string[] => {
  const slash = "/";
  const trimmed = trimEndChar(trimStartChar(urlPrefix.trim(), slash), slash);
  if (trimmed === "") {
    const empty: string[] = [];
    return empty;
  }
  return trimmed.split("/");
};

const combineOsPath = (segments: string[]): string => {
  if (segments.length === 0) return "";
  let p = segments[0]!;
  for (let i = 1; i < segments.length; i++) p = Path.Combine(p, segments[i]!);
  return p;
};

const combineOutputRelPath = (segments: string[]): string => {
  if (segments.length === 0) return "index.html";
  let p = segments[0]!;
  for (let i = 1; i < segments.length; i++) {
    p = Path.Combine(p, segments[i]!);
  }
  return Path.Combine(p, "index.html");
};

const computeEditUrl = (mount: DocsMountConfig, relPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash = "/";
  const repo = trimEndChar(mount.repoUrl.trim(), slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const repoPath = mount.repoPath;
  const rel = trimStartChar(relPath, slash);
  if (repoPath === undefined || repoPath.trim() === "") {
    return `${repo}/blob/${branch}/${rel}`;
  }
  const rp = trimEndChar(trimStartChar(repoPath.trim(), slash), slash);
  return `${repo}/blob/${branch}/${rp}/${rel}`;
};

const scanMount = (outDir: string, mount: DocsMountConfig): DocsMarkdownRoute[] => {
  if (!Directory.Exists(mount.sourceDir)) throw new Exception(`Docs mount not found: ${mount.sourceDir}`);

  const prefixSegs = mountPrefixSegments(mount.urlPrefix);
  const prefixOs = prefixSegs.length === 0 ? "" : combineOsPath(prefixSegs);
  const routes = new List<DocsMarkdownRoute>();

  const files = Directory.GetFiles(mount.sourceDir, "*", SearchOption.AllDirectories);
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i]!;
    const rel = normalizeSlashes(Path.GetRelativePath(mount.sourceDir, srcFile));
    if (rel === "" || rel.startsWith("..")) continue;

    const lower = srcFile.toLowerCase();
    if (!lower.endsWith(".md")) {
      const slash = "/";
      const relOs = replaceText(rel, slash, `${Path.DirectorySeparatorChar}`);
      const destRel = prefixOs === "" ? relOs : Path.Combine(prefixOs, relOs);
      const destFile = Path.Combine(outDir, destRel);
      const destDir = Path.GetDirectoryName(destFile);
      if (destDir !== null && destDir !== "") Directory.CreateDirectory(destDir);
      File.Copy(srcFile, destFile, true);
      continue;
    }

    const parts = splitPath(rel);
    const fileName = parts.length > 0 ? parts[parts.length - 1]! : rel;
    const dirPartsList = new List<string>();
    for (let j = 0; j < parts.length - 1; j++) dirPartsList.Add(parts[j]!);
    const dirParts = dirPartsList.ToArray();
    const dirKey = joinUrlPath(dirParts);

    const isIndex = isIndexMarkdownFile(fileName);
    const urlSegs = new List<string>();
    for (let j = 0; j < dirParts.length; j++) urlSegs.Add(dirParts[j]!);
    if (!isIndex) urlSegs.Add(withoutMdExtension(fileName));
    const urlSegments = urlSegs.ToArray();

    const outSegs = new List<string>();
    for (let j = 0; j < prefixSegs.length; j++) outSegs.Add(prefixSegs[j]!);
    for (let j = 0; j < urlSegments.length; j++) outSegs.Add(urlSegments[j]!);
    const outputSegments = outSegs.ToArray();

    const urlParts = new List<string>();
    urlParts.Add(mount.urlPrefix);
    for (let j = 0; j < urlSegments.length; j++) urlParts.Add(urlSegments[j]!);
    const relPermalink = combineUrl(urlParts.ToArray());
    const outputRelPath = combineOutputRelPath(outputSegments);

    routes.Add(
      new DocsMarkdownRoute(mount, srcFile, rel, dirKey, fileName, isIndex, urlSegments, outputSegments, relPermalink, outputRelPath),
    );
  }

  return routes.ToArray();
};

const addDirWithParents = (dirKey: string, dirSet: Dictionary<string, boolean>): void => {
  let cur = dirKey.trim();
  while (true) {
    dirSet.Remove(cur);
    dirSet.Add(cur, true);
    if (cur === "") return;
    const idx = cur.lastIndexOf("/");
    if (idx < 0) {
      cur = "";
    } else {
      cur = substringCount(cur, 0, idx);
    }
  }
};

const dirDepth = (dirKey: string): int => {
  if (dirKey === "") return 0;
  let depth: int = 1;
  let pos = 0;
  while (true) {
    const idx = dirKey.indexOf("/", pos);
    if (idx < 0) break;
    depth++;
    pos = idx + 1;
  }
  return depth;
};

const parentDirKey = (dirKey: string): string => {
  const idx = dirKey.lastIndexOf("/");
  return idx < 0 ? "" : substringCount(dirKey, 0, idx);
};

const lastDirSegment = (dirKey: string): string => {
  const idx = dirKey.lastIndexOf("/");
  return idx < 0 ? dirKey : substringFrom(dirKey, idx + 1);
};

function assignAncestry(page: PageContext, parent: PageContext | undefined, ancestors: PageContext[]): void {
  page.parent = parent;
  page.ancestors = ancestors;
  if (page.kind === "page") return;

  const kids = page.pages;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]!;
    const nextAncestors = new List<PageContext>();
    for (let j = 0; j < ancestors.length; j++) nextAncestors.Add(ancestors[j]!);
    nextAncestors.Add(page);
    assignAncestry(child, page, nextAncestors.ToArray());
  }
}

export const buildDocsSite = (request: BuildRequest, docsLoaded: LoadedDocsConfig): BuildResult => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  if (request.baseURL !== undefined && request.baseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(request.baseURL.trim());
  }

  const docsConfig = docsLoaded.config;
  if (docsConfig.siteName.trim() !== "") config.title = docsConfig.siteName.trim();

  const outDir = Path.IsPathRooted(request.destinationDir) ? request.destinationDir : Path.Combine(siteDir, request.destinationDir);
  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir);
  if (request.cleanDestinationDir) deleteDirRecursive(outDir);
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.Combine(themeDir, "static"), outDir);
  }
  copyDirRecursive(Path.Combine(siteDir, "static"), outDir);

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];
  const site = new SiteContext(config, emptyPages);

  const baseTpl = selectTemplate(env, ["_default/baseof.html"]);
  const homeTpl = selectTemplate(env, ["index.html", "docs/home.html", "docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const listTpl = selectTemplate(env, ["docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const singleTpl = selectTemplate(env, ["docs/single.html", "_default/single.html"]) ?? "_default/single.html";

  const mountRootPages = new List<PageContext>();
  const allPagesForOutput = new List<PageContext>();
  const mountContexts = new List<DocsMountContext>();
  const searchDocs = new List<SearchDoc>();

  const mounts = docsConfig.mounts;
  for (let mountIndex = 0; mountIndex < mounts.length; mountIndex++) {
    const mount = mounts[mountIndex]!;
    const routes = scanMount(outDir, mount);
    const routeMap = new Dictionary<string, string>();
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      const key = r.relPath.toLowerCase();
      routeMap.Remove(key);
      routeMap.Add(key, r.relPermalink);
    }
    mountContexts.Add(new DocsMountContext(mount.name, mount.urlPrefix, loadMountNav(mount, routeMap)));

    const prefixSegs = mountPrefixSegments(mount.urlPrefix);
    const mountSection = prefixSegs.length > 0 ? prefixSegs[0]! : mount.name;

    const indexByDir = new Dictionary<string, DocsMarkdownRoute>();
    const leafRoutes = new List<DocsMarkdownRoute>();
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      if (r.isIndex) {
        indexByDir.Remove(r.dirKey);
        indexByDir.Add(r.dirKey, r);
      } else {
        leafRoutes.Add(r);
      }
    }

    const leafPagesByDir = new Dictionary<string, List<PageContext>>();
    const leafArr = leafRoutes.ToArray();
    for (let i = 0; i < leafArr.length; i++) {
      const r = leafArr[i]!;

      const parsed = parseContent(readTextFile(r.sourcePath));
      const fm = parsed.frontMatter;
      if (fm.draft && !request.buildDrafts) continue;

      const md = renderDocsMarkdown(parsed.body, new DocsLinkRewriteContext(mount, r.dirKey, routeMap, docsConfig.strictLinks));
      const content = new HtmlString(md.html);
      const summary = new HtmlString(md.summaryHtml);
      const plainText = Markdown.ToPlainText(parsed.body, markdownPipeline);

      const baseName = withoutMdExtension(r.fileName);
      const title = fm.title ?? humanizeSlug(baseName);
      const dateUtc = fm.date ?? statSync(r.sourcePath).mtime;
      const dateString = dateUtc.toISOString();
      const lastmodString = statSync(r.sourcePath).mtime.toISOString();
      const file = new PageFile(Path.GetFullPath(r.sourcePath), r.dirKey === "" ? "" : r.dirKey + "/", baseName);

      const params = fm.Params;
      params.set("mount", ParamValue.string(mount.name));
      params.set("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.set("relPath", ParamValue.string(r.relPath));
      const editUrl = computeEditUrl(mount, r.relPath);
      if (editUrl !== undefined) {
        params.set("editURL", ParamValue.string(editUrl));
      }

      const ctx = new PageContext(
        title,
        dateString,
        lastmodString,
        fm.draft,
        "page",
        mountSection,
        fm.type ?? "docs",
        baseName,
        r.relPermalink,
        plainText,
        new HtmlString(""),
        content,
        summary,
        fm.description ?? "",
        fm.tags,
        fm.categories,
        params,
        file,
        site.Language,
        emptyTranslations,
        undefined,
        site,
        emptyPages,
        undefined,
        emptyPages,
        fm.layout,
      );

      let list = new List<PageContext>();
      const has = leafPagesByDir.TryGetValue(r.dirKey, list);
      if (!has) {
        list = new List<PageContext>();
        leafPagesByDir.Remove(r.dirKey);
        leafPagesByDir.Add(r.dirKey, list);
      }
      list.Add(ctx);
      allPagesForOutput.Add(ctx);
      searchDocs.Add(new SearchDoc(title, r.relPermalink, mount.name, plainText));
    }

    const dirSet = new Dictionary<string, boolean>();
    addDirWithParents("", dirSet);
    const indexKeysIt = indexByDir.Keys.GetEnumerator();
    while (indexKeysIt.MoveNext()) addDirWithParents(indexKeysIt.Current, dirSet);
    const leafKeysIt = leafPagesByDir.Keys.GetEnumerator();
    while (leafKeysIt.MoveNext()) addDirWithParents(leafKeysIt.Current, dirSet);

    const childDirsByDir = new Dictionary<string, List<string>>();
    const dirKeyIt = dirSet.Keys.GetEnumerator();
    while (dirKeyIt.MoveNext()) {
      const dirKey = dirKeyIt.Current;
      if (dirKey === "") continue;
      const parentKey = parentDirKey(dirKey);
      let list = new List<string>();
      const hasParentList = childDirsByDir.TryGetValue(parentKey, list);
      if (!hasParentList) {
        list = new List<string>();
        childDirsByDir.Remove(parentKey);
        childDirsByDir.Add(parentKey, list);
      }
      list.Add(dirKey);
    }

    const dirKeysList = new List<string>();
    const dirIt = dirSet.Keys.GetEnumerator();
    while (dirIt.MoveNext()) dirKeysList.Add(dirIt.Current);
    dirKeysList.Sort((a: string, b: string) => dirDepth(b) - dirDepth(a));
    const dirKeys = dirKeysList.ToArray();

    const sectionByDir = new Dictionary<string, PageContext>();
    const pagePlaceholder = new PageContext(
      "",
      "",
      "",
      false,
      "section",
      "",
      "",
      "",
      "",
      "",
      new HtmlString(""),
      new HtmlString(""),
      new HtmlString(""),
      "",
      emptyStrings,
      emptyStrings,
      new Map<string, ParamValue>(),
      undefined,
      site.Language,
      emptyTranslations,
      undefined,
      site,
      emptyPages,
      undefined,
      emptyPages,
    );

    for (let i = 0; i < dirKeys.length; i++) {
      const dirKey = dirKeys[i]!;

      const childPages = new List<PageContext>();

      let childDirList = new List<string>();
      const hasChildDirs = childDirsByDir.TryGetValue(dirKey, childDirList);
      if (hasChildDirs) {
        childDirList.Sort((a: string, b: string) => compareText(a, b));
        const childDirKeys = childDirList.ToArray();
        for (let j = 0; j < childDirKeys.length; j++) {
          const childKey = childDirKeys[j]!;
          let childSection = pagePlaceholder;
          const hasChildSection = sectionByDir.TryGetValue(childKey, childSection);
          if (hasChildSection) childPages.Add(childSection);
        }
      }

      let leafList = new List<PageContext>();
      const hasLeaf = leafPagesByDir.TryGetValue(dirKey, leafList);
      if (hasLeaf) {
        leafList.Sort((a: PageContext, b: PageContext) => compareText(a.title, b.title));
        const leafPages = leafList.ToArray();
        for (let j = 0; j < leafPages.length; j++) childPages.Add(leafPages[j]!);
      }

      const routeSegments: string[] = dirKey === "" ? emptyStrings : dirKey.split("/");
      const urlParts = new List<string>();
      urlParts.Add(mount.urlPrefix);
      for (let j = 0; j < routeSegments.length; j++) urlParts.Add(routeSegments[j]!);
      const relPermalink = combineUrl(urlParts.ToArray());

      const idxPlaceholder = new DocsMarkdownRoute(mount, "", "", "", "", true, emptyStrings, emptyStrings, "", "");
      let idxRoute = idxPlaceholder;
      const hasIdx = indexByDir.TryGetValue(dirKey, idxRoute);

      const dirSlug = dirKey === "" ? mountSection : lastDirSegment(dirKey);
      let title = dirKey === "" ? mount.name : humanizeSlug(dirSlug);
      let content = new HtmlString("");
      let summary = new HtmlString("");
      let plain = "";
      let description = "";
      let params = new Map<string, ParamValue>();
      let draft = false;
      let dateString = "";
      let lastmodString = "";
      let file: PageFile | undefined = undefined;
      let layout: string | undefined = undefined;

      if (hasIdx) {
        const parsed = parseContent(readTextFile(idxRoute.sourcePath));
        const fm = parsed.frontMatter;
        draft = fm.draft;
        layout = fm.layout;
        if (draft && !request.buildDrafts) {
          // Draft section index: keep default empty content, but still generate list page.
        } else {
          const md = renderDocsMarkdown(parsed.body, new DocsLinkRewriteContext(mount, dirKey, routeMap, docsConfig.strictLinks));
          content = new HtmlString(md.html);
          summary = new HtmlString(md.summaryHtml);
          description = fm.description ?? "";
          title = fm.title ?? title;
          const plainText = Markdown.ToPlainText(parsed.body, markdownPipeline);
          plain = plainText;
          searchDocs.Add(new SearchDoc(title, relPermalink, mount.name, plainText));
          const dateUtc = fm.date ?? statSync(idxRoute.sourcePath).mtime;
          dateString = dateUtc.toISOString();
          lastmodString = statSync(idxRoute.sourcePath).mtime.toISOString();
          file = new PageFile(Path.GetFullPath(idxRoute.sourcePath), dirKey === "" ? "" : dirKey + "/", "_index");
          params = fm.Params;
          params.set("relPath", ParamValue.string(idxRoute.relPath));
          const editUrl = computeEditUrl(mount, idxRoute.relPath);
          if (editUrl !== undefined) {
            params.set("editURL", ParamValue.string(editUrl));
          }
        }
      }

      params.set("mount", ParamValue.string(mount.name));
      params.set("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.set("dirKey", ParamValue.string(dirKey));

      const slug = dirSlug;
      const sectionCtx = new PageContext(
        title,
        dateString,
        lastmodString,
        draft,
        "section",
        mountSection,
        "docs",
        slug,
        relPermalink,
        plain,
        new HtmlString(""),
        content,
        summary,
        description,
        emptyStrings,
        emptyStrings,
        params,
        file,
        site.Language,
        emptyTranslations,
        undefined,
        site,
        childPages.ToArray(),
        undefined,
        emptyPages,
        layout,
      );

      sectionByDir.Remove(dirKey);
      sectionByDir.Add(dirKey, sectionCtx);
      allPagesForOutput.Add(sectionCtx);
    }

    let mountRoot = pagePlaceholder;
    const hasMountRoot = sectionByDir.TryGetValue("", mountRoot);
    if (hasMountRoot) {
      mountRootPages.Add(mountRoot);
    }
  }

  const mountRoots = mountRootPages.ToArray();
  site.pages = mountRoots;
  site.docsMounts = mountContexts.ToArray();

  const chosenHome =
    docsConfig.homeMount !== undefined && docsConfig.homeMount.trim() !== ""
      ? docsConfig.homeMount.trim().toLowerCase()
      : undefined;

  let homeContent = new HtmlString("");
  let homeSummary = new HtmlString("");
  let homeDescription = "";
  let homeTitle = config.title;

  if (chosenHome !== undefined) {
    for (let i = 0; i < mountRoots.length; i++) {
      const m = mountRoots[i]!;
      const mountNameParam = m.Params.get("mount") ?? ParamValue.string("");
      const mountPrefixParam = m.Params.get("mountPrefix") ?? ParamValue.string("");
      const mountName = mountNameParam.stringValue;
      const mountPrefix = mountPrefixParam.stringValue;
      if (mountName.toLowerCase() === chosenHome || mountPrefix.toLowerCase() === chosenHome) {
        homeTitle = m.title;
        homeContent = m.content;
        homeSummary = m.summary;
        homeDescription = m.description;
        break;
      }
    }
  }

  const homeCtx = new PageContext(
    homeTitle,
    "",
    "",
    false,
    "home",
    "",
    "docs",
    "",
    "/",
    "",
    new HtmlString(""),
    homeContent,
    homeSummary,
    homeDescription,
    emptyStrings,
    emptyStrings,
    new Map<string, ParamValue>(),
    undefined,
    site.Language,
    emptyTranslations,
    undefined,
    site,
    mountRoots,
    undefined,
    emptyPages,
  );

  assignAncestry(homeCtx, undefined, emptyPages);

  const homeHtml = renderWithBase(env, baseTpl, homeTpl, homeCtx);
  writeTextFile(Path.Combine(outDir, "index.html"), homeHtml);

  let pagesBuilt: int = 1;

  // Render all docs pages (skip the home page, which is always /index.html).
  const allPages = allPagesForOutput.ToArray();
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i]!;
    if (page.relPermalink === "/") continue;

    const tpl = page.kind === "page" ? singleTpl : listTpl;
    const html = renderWithBase(env, baseTpl, tpl, page);

    const slash = "/";
    const outRel = replaceText(
      trimEndChar(trimStartChar(page.relPermalink, slash), slash),
      slash,
      `${Path.DirectorySeparatorChar}`
    );
    const outFile = outRel === "" ? Path.Combine(outDir, "index.html") : Path.Combine(outDir, outRel, "index.html");
    writeTextFile(outFile, html);
    pagesBuilt++;
  }

  if (docsConfig.generateSearchIndex) {
    const name = docsConfig.searchIndexFileName.trim();
    if (name !== "") {
      const json = renderSearchIndexJson(searchDocs.ToArray());
      writeTextFile(Path.Combine(outDir, name), json);
      pagesBuilt++;
    }
  }

  return new BuildResult(outDir, pagesBuilt);
};
