import { DateTime, Exception } from "@tsonic/dotnet/System.js";
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
import { replaceText } from "../utils/strings.ts";
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
  sb.append("[");
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!;
    if (i > 0) sb.append(",");
    sb.append("{");
    sb.append("\"title\":\"");
    sb.append(escapeJsonString(d.title));
    sb.append("\",\"url\":\"");
    sb.append(escapeJsonString(d.url));
    sb.append("\",\"mount\":\"");
    sb.append(escapeJsonString(d.mount));
    sb.append("\",\"text\":\"");
    sb.append(escapeJsonString(d.text));
    sb.append("\"}");
  }
  sb.append("]");
  return sb.toString();
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

const normalizeSlashes = (path: string): string => path.replace("\\", "/");

const splitPath = (relativePath: string): string[] => normalizeSlashes(relativePath).split("/");

const joinUrlPath = (parts: string[]): string => {
  if (parts.length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += "/" + parts[i]!;
  return out;
};

const isIndexMarkdownFile = (fileName: string): boolean => {
  const lower = fileName.toLowerInvariant();
  return lower === "_index.md" || lower === "index.md" || lower === "readme.md";
};

const withoutMdExtension = (fileName: string): string => {
  const lower = fileName.toLowerInvariant();
  return lower.endsWith(".md") ? fileName.substring(0, fileName.length - 3) : fileName;
};

const mountPrefixSegments = (urlPrefix: string): string[] => {
  const slash: char = "/";
  const trimmed = urlPrefix.trim().trimStart(slash).trimEnd(slash);
  if (trimmed === "") {
    const empty: string[] = [];
    return empty;
  }
  return trimmed.split("/");
};

const combineOsPath = (segments: string[]): string => {
  if (segments.length === 0) return "";
  let p = segments[0]!;
  for (let i = 1; i < segments.length; i++) p = Path.combine(p, segments[i]!);
  return p;
};

const combineOutputRelPath = (segments: string[]): string => {
  if (segments.length === 0) return "index.html";
  let p = segments[0]!;
  for (let i = 1; i < segments.length; i++) {
    p = Path.combine(p, segments[i]!);
  }
  return Path.combine(p, "index.html");
};

const computeEditUrl = (mount: DocsMountConfig, relPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash: char = "/";
  const repo = mount.repoUrl.trim().trimEnd(slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const repoPath = mount.repoPath;
  const rel = relPath.trimStart(slash);
  if (repoPath === undefined || repoPath.trim() === "") {
    return `${repo}/blob/${branch}/${rel}`;
  }
  const rp = repoPath.trim().trimStart(slash).trimEnd(slash);
  return `${repo}/blob/${branch}/${rp}/${rel}`;
};

const scanMount = (outDir: string, mount: DocsMountConfig): DocsMarkdownRoute[] => {
  if (!Directory.exists(mount.sourceDir)) throw new Exception(`Docs mount not found: ${mount.sourceDir}`);

  const prefixSegs = mountPrefixSegments(mount.urlPrefix);
  const prefixOs = prefixSegs.length === 0 ? "" : combineOsPath(prefixSegs);
  const routes = new List<DocsMarkdownRoute>();

  const files = Directory.getFiles(mount.sourceDir, "*", SearchOption.allDirectories);
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i]!;
    const rel = normalizeSlashes(Path.getRelativePath(mount.sourceDir, srcFile));
    if (rel === "" || rel.startsWith("..")) continue;

    const lower = srcFile.toLowerInvariant();
    if (!lower.endsWith(".md")) {
      const slash: char = "/";
      const relOs = rel.replace(slash, Path.directorySeparatorChar);
      const destRel = prefixOs === "" ? relOs : Path.combine(prefixOs, relOs);
      const destFile = Path.combine(outDir, destRel);
      const destDir = Path.getDirectoryName(destFile);
      if (destDir !== undefined && destDir !== "") Directory.createDirectory(destDir);
      File.copy(srcFile, destFile, true);
      continue;
    }

    const parts = splitPath(rel);
    const fileName = parts.length > 0 ? parts[parts.length - 1]! : rel;
    const dirPartsList = new List<string>();
    for (let j = 0; j < parts.length - 1; j++) dirPartsList.add(parts[j]!);
    const dirParts = dirPartsList.toArray();
    const dirKey = joinUrlPath(dirParts);

    const isIndex = isIndexMarkdownFile(fileName);
    const urlSegs = new List<string>();
    for (let j = 0; j < dirParts.length; j++) urlSegs.add(dirParts[j]!);
    if (!isIndex) urlSegs.add(withoutMdExtension(fileName));
    const urlSegments = urlSegs.toArray();

    const outSegs = new List<string>();
    for (let j = 0; j < prefixSegs.length; j++) outSegs.add(prefixSegs[j]!);
    for (let j = 0; j < urlSegments.length; j++) outSegs.add(urlSegments[j]!);
    const outputSegments = outSegs.toArray();

    const urlParts = new List<string>();
    urlParts.add(mount.urlPrefix);
    for (let j = 0; j < urlSegments.length; j++) urlParts.add(urlSegments[j]!);
    const relPermalink = combineUrl(urlParts.toArray());
    const outputRelPath = combineOutputRelPath(outputSegments);

    routes.add(
      new DocsMarkdownRoute(mount, srcFile, rel, dirKey, fileName, isIndex, urlSegments, outputSegments, relPermalink, outputRelPath),
    );
  }

  return routes.toArray();
};

const addDirWithParents = (dirKey: string, dirSet: Dictionary<string, boolean>): void => {
  let cur = dirKey.trim();
  while (true) {
    dirSet.remove(cur);
    dirSet.add(cur, true);
    if (cur === "") return;
    const idx = cur.lastIndexOf("/");
    if (idx < 0) {
      cur = "";
    } else {
      cur = cur.substring(0, idx);
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
  return idx < 0 ? "" : dirKey.substring(0, idx);
};

const lastDirSegment = (dirKey: string): string => {
  const idx = dirKey.lastIndexOf("/");
  return idx < 0 ? dirKey : dirKey.substring(idx + 1);
};

function assignAncestry(page: PageContext, parent: PageContext | undefined, ancestors: PageContext[]): void {
  page.parent = parent;
  page.ancestors = ancestors;
  if (page.kind === "page") return;

  const kids = page.pages;
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i]!;
    const nextAncestors = new List<PageContext>();
    for (let j = 0; j < ancestors.length; j++) nextAncestors.add(ancestors[j]!);
    nextAncestors.add(page);
    assignAncestry(child, page, nextAncestors.toArray());
  }
}

export const buildDocsSite = (request: BuildRequest, docsLoaded: LoadedDocsConfig): BuildResult => {
  const siteDir = Path.getFullPath(request.siteDir);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  if (request.baseURL !== undefined && request.baseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(request.baseURL.trim());
  }

  const docsConfig = docsLoaded.config;
  if (docsConfig.siteName.trim() !== "") config.title = docsConfig.siteName.trim();

  const outDir = Path.isPathRooted(request.destinationDir) ? request.destinationDir : Path.combine(siteDir, request.destinationDir);
  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir);
  if (request.cleanDestinationDir) deleteDirRecursive(outDir);
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.combine(themeDir, "static"), outDir);
  }
  copyDirRecursive(Path.combine(siteDir, "static"), outDir);

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
      const key = r.relPath.toLowerInvariant();
      routeMap.remove(key);
      routeMap.add(key, r.relPermalink);
    }
    mountContexts.add(new DocsMountContext(mount.name, mount.urlPrefix, loadMountNav(mount, routeMap)));

    const prefixSegs = mountPrefixSegments(mount.urlPrefix);
    const mountSection = prefixSegs.length > 0 ? prefixSegs[0]! : mount.name;

    const indexByDir = new Dictionary<string, DocsMarkdownRoute>();
    const leafRoutes = new List<DocsMarkdownRoute>();
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      if (r.isIndex) {
        indexByDir.remove(r.dirKey);
        indexByDir.add(r.dirKey, r);
      } else {
        leafRoutes.add(r);
      }
    }

    const leafPagesByDir = new Dictionary<string, List<PageContext>>();
    const leafArr = leafRoutes.toArray();
    for (let i = 0; i < leafArr.length; i++) {
      const r = leafArr[i]!;

      const parsed = parseContent(readTextFile(r.sourcePath));
      const fm = parsed.frontMatter;
      if (fm.draft && !request.buildDrafts) continue;

      const md = renderDocsMarkdown(parsed.body, new DocsLinkRewriteContext(mount, r.dirKey, routeMap, docsConfig.strictLinks));
      const content = new HtmlString(md.html);
      const summary = new HtmlString(md.summaryHtml);
      const plainText = Markdown.toPlainText(parsed.body, markdownPipeline);

      const baseName = withoutMdExtension(r.fileName);
      const title = fm.title ?? humanizeSlug(baseName);
      const dateUtc = fm.date ?? File.getLastWriteTimeUtc(r.sourcePath);
      const dateString = dateUtc.toString("O");
      const lastmodString = File.getLastWriteTimeUtc(r.sourcePath).toString("O");
      const file = new PageFile(Path.getFullPath(r.sourcePath), r.dirKey === "" ? "" : r.dirKey + "/", baseName);

      const params = fm.Params;
      params.remove("mount");
      params.add("mount", ParamValue.string(mount.name));
      params.remove("mountPrefix");
      params.add("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.remove("relPath");
      params.add("relPath", ParamValue.string(r.relPath));
      const editUrl = computeEditUrl(mount, r.relPath);
      if (editUrl !== undefined) {
        params.remove("editURL");
        params.add("editURL", ParamValue.string(editUrl));
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
      const has = leafPagesByDir.tryGetValue(r.dirKey, list);
      if (!has) {
        list = new List<PageContext>();
        leafPagesByDir.remove(r.dirKey);
        leafPagesByDir.add(r.dirKey, list);
      }
      list.add(ctx);
      allPagesForOutput.add(ctx);
      searchDocs.add(new SearchDoc(title, r.relPermalink, mount.name, plainText));
    }

    const dirSet = new Dictionary<string, boolean>();
    addDirWithParents("", dirSet);
    const indexKeysIt = indexByDir.keys.getEnumerator();
    while (indexKeysIt.moveNext()) addDirWithParents(indexKeysIt.current, dirSet);
    const leafKeysIt = leafPagesByDir.keys.getEnumerator();
    while (leafKeysIt.moveNext()) addDirWithParents(leafKeysIt.current, dirSet);

    const childDirsByDir = new Dictionary<string, List<string>>();
    const dirKeyIt = dirSet.keys.getEnumerator();
    while (dirKeyIt.moveNext()) {
      const dirKey = dirKeyIt.current;
      if (dirKey === "") continue;
      const parentKey = parentDirKey(dirKey);
      let list = new List<string>();
      const hasParentList = childDirsByDir.tryGetValue(parentKey, list);
      if (!hasParentList) {
        list = new List<string>();
        childDirsByDir.remove(parentKey);
        childDirsByDir.add(parentKey, list);
      }
      list.add(dirKey);
    }

    const dirKeysList = new List<string>();
    const dirIt = dirSet.keys.getEnumerator();
    while (dirIt.moveNext()) dirKeysList.add(dirIt.current);
    dirKeysList.sort((a: string, b: string) => dirDepth(b) - dirDepth(a));
    const dirKeys = dirKeysList.toArray();

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
      new Dictionary<string, ParamValue>(),
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
      const hasChildDirs = childDirsByDir.tryGetValue(dirKey, childDirList);
      if (hasChildDirs) {
        childDirList.sort((a: string, b: string) => a.compareTo(b));
        const childDirKeys = childDirList.toArray();
        for (let j = 0; j < childDirKeys.length; j++) {
          const childKey = childDirKeys[j]!;
          let childSection = pagePlaceholder;
          const hasChildSection = sectionByDir.tryGetValue(childKey, childSection);
          if (hasChildSection) childPages.add(childSection);
        }
      }

      let leafList = new List<PageContext>();
      const hasLeaf = leafPagesByDir.tryGetValue(dirKey, leafList);
      if (hasLeaf) {
        leafList.sort((a: PageContext, b: PageContext) => a.title.compareTo(b.title));
        const leafPages = leafList.toArray();
        for (let j = 0; j < leafPages.length; j++) childPages.add(leafPages[j]!);
      }

      const routeSegments: string[] = dirKey === "" ? emptyStrings : dirKey.split("/");
      const urlParts = new List<string>();
      urlParts.add(mount.urlPrefix);
      for (let j = 0; j < routeSegments.length; j++) urlParts.add(routeSegments[j]!);
      const relPermalink = combineUrl(urlParts.toArray());

      const idxPlaceholder = new DocsMarkdownRoute(mount, "", "", "", "", true, emptyStrings, emptyStrings, "", "");
      let idxRoute = idxPlaceholder;
      const hasIdx = indexByDir.tryGetValue(dirKey, idxRoute);

      const dirSlug = dirKey === "" ? mountSection : lastDirSegment(dirKey);
      let title = dirKey === "" ? mount.name : humanizeSlug(dirSlug);
      let content = new HtmlString("");
      let summary = new HtmlString("");
      let plain = "";
      let description = "";
      let params = new Dictionary<string, ParamValue>();
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
          const plainText = Markdown.toPlainText(parsed.body, markdownPipeline);
          plain = plainText;
          searchDocs.add(new SearchDoc(title, relPermalink, mount.name, plainText));
          const dateUtc = fm.date ?? File.getLastWriteTimeUtc(idxRoute.sourcePath);
          dateString = dateUtc.toString("O");
          lastmodString = File.getLastWriteTimeUtc(idxRoute.sourcePath).toString("O");
          file = new PageFile(Path.getFullPath(idxRoute.sourcePath), dirKey === "" ? "" : dirKey + "/", "_index");
          params = fm.Params;
          params.remove("relPath");
          params.add("relPath", ParamValue.string(idxRoute.relPath));
          const editUrl = computeEditUrl(mount, idxRoute.relPath);
          if (editUrl !== undefined) {
            params.remove("editURL");
            params.add("editURL", ParamValue.string(editUrl));
          }
        }
      }

      params.remove("mount");
      params.add("mount", ParamValue.string(mount.name));
      params.remove("mountPrefix");
      params.add("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.remove("dirKey");
      params.add("dirKey", ParamValue.string(dirKey));

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
        childPages.toArray(),
        undefined,
        emptyPages,
        layout,
      );

      sectionByDir.remove(dirKey);
      sectionByDir.add(dirKey, sectionCtx);
      allPagesForOutput.add(sectionCtx);
    }

    let mountRoot = pagePlaceholder;
    const hasMountRoot = sectionByDir.tryGetValue("", mountRoot);
    if (hasMountRoot) {
      mountRootPages.add(mountRoot);
    }
  }

  const mountRoots = mountRootPages.toArray();
  site.pages = mountRoots;
  site.docsMounts = mountContexts.toArray();

  const chosenHome =
    docsConfig.homeMount !== undefined && docsConfig.homeMount.trim() !== ""
      ? docsConfig.homeMount.trim().toLowerInvariant()
      : undefined;

  let homeContent = new HtmlString("");
  let homeSummary = new HtmlString("");
  let homeDescription = "";
  let homeTitle = config.title;

  if (chosenHome !== undefined) {
    for (let i = 0; i < mountRoots.length; i++) {
      const m = mountRoots[i]!;
      let mountNameParam = ParamValue.string("");
      m.Params.tryGetValue("mount", mountNameParam);
      let mountPrefixParam = ParamValue.string("");
      m.Params.tryGetValue("mountPrefix", mountPrefixParam);
      const mountName = mountNameParam.stringValue;
      const mountPrefix = mountPrefixParam.stringValue;
      if (mountName.toLowerInvariant() === chosenHome || mountPrefix.toLowerInvariant() === chosenHome) {
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
    new Dictionary<string, ParamValue>(),
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
  writeTextFile(Path.combine(outDir, "index.html"), homeHtml);

  let pagesBuilt: int = 1;

  // Render all docs pages (skip the home page, which is always /index.html).
  const allPages = allPagesForOutput.toArray();
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i]!;
    if (page.relPermalink === "/") continue;

    const tpl = page.kind === "page" ? singleTpl : listTpl;
    const html = renderWithBase(env, baseTpl, tpl, page);

    const slash: char = "/";
    const outRel = page.relPermalink.trimStart(slash).trimEnd(slash).replace(slash, Path.directorySeparatorChar);
    const outFile = outRel === "" ? Path.combine(outDir, "index.html") : Path.combine(outDir, outRel, "index.html");
    writeTextFile(outFile, html);
    pagesBuilt++;
  }

  if (docsConfig.generateSearchIndex) {
    const name = docsConfig.searchIndexFileName.trim();
    if (name !== "") {
      const json = renderSearchIndexJson(searchDocs.toArray());
      writeTextFile(Path.combine(outDir, name), json);
      pagesBuilt++;
    }
  }

  return new BuildResult(outDir, pagesBuilt);
};
