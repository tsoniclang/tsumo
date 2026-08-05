import { statSync } from "node:fs";
import { Exception } from "@tsonic/dotnet/System.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { char, int } from "@tsonic/csharp/types.js";
import { loadSiteConfig } from "../config.js";
import { parseContent } from "../frontmatter.js";
import { copyDirRecursive, ensureDir, readTextFile, writeTextFile } from "../fs.js";
import { BuildEnvironment } from "../env.js";
import { BuildRequest, PageContext, PageFile, SiteContext } from "../models.js";
import { Markdown } from "@tsonic/dotnet/Markdig.js";
import { markdownPipeline } from "../markdown.js";
import { HtmlString } from "../utils/html.js";
import { ensureTrailingSlash, humanizeSlug } from "../utils/text.js";
import { combineUrl, renderWithBase, resolveThemeDir, selectTemplate } from "../build/layout.js";
import { LoadedDocsConfig } from "./config.js";
import { DocsMountConfig, DocsMountContext } from "./models.js";
import { DocsLinkRewriteContext, renderDocsMarkdown } from "./markdown.js";
import { loadMountNav } from "./nav.js";
import { compareText, replaceText, substringCount, substringFrom, trimEndChar, trimStartChar } from "../utils/strings.js";
import { ParamValue } from "../params.js";

class SearchDoc {
  title: string;
  url: string;
  mount: string;
  text: string;

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
  mount: DocsMountConfig;
  sourcePath: string;
  relPath: string;
  dirKey: string;
  fileName: string;
  isIndex: boolean;
  urlSegments: string[];
  outputSegments: string[];
  relPermalink: string;
  outputRelPath: string;

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
  const repoUrl = mount.repoUrl;
  if (repoUrl === undefined) return undefined;
  const slash = "/";
  const repo = trimEndChar(repoUrl.trim(), slash);
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
  const routes: DocsMarkdownRoute[] = [];

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
      if (destDir !== undefined && destDir !== "") Directory.CreateDirectory(destDir);
      File.Copy(srcFile, destFile, true);
      continue;
    }

    const parts = splitPath(rel);
    const fileName = parts.length > 0 ? parts[parts.length - 1]! : rel;
    const dirParts: string[] = [];
    for (let j = 0; j < parts.length - 1; j++) dirParts.push(parts[j]!);
    const dirKey = joinUrlPath(dirParts);

    const isIndex = isIndexMarkdownFile(fileName);
    const urlSegments: string[] = [];
    for (let j = 0; j < dirParts.length; j++) urlSegments.push(dirParts[j]!);
    if (!isIndex) urlSegments.push(withoutMdExtension(fileName));

    const outputSegments: string[] = [];
    for (let j = 0; j < prefixSegs.length; j++) outputSegments.push(prefixSegs[j]!);
    for (let j = 0; j < urlSegments.length; j++) outputSegments.push(urlSegments[j]!);

    const urlParts: string[] = [];
    urlParts.push(mount.urlPrefix);
    for (let j = 0; j < urlSegments.length; j++) urlParts.push(urlSegments[j]!);
    const relPermalink = combineUrl(urlParts);
    const outputRelPath = combineOutputRelPath(outputSegments);

    routes.push(
      new DocsMarkdownRoute(mount, srcFile, rel, dirKey, fileName, isIndex, urlSegments, outputSegments, relPermalink, outputRelPath),
    );
  }

  return routes;
};

const addDirWithParents = (dirKey: string, dirSet: Map<string, boolean>): void => {
  let cur = dirKey.trim();
  while (true) {
    dirSet.set(cur, true);
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
    const nextAncestors: PageContext[] = [];
    for (let j = 0; j < ancestors.length; j++) nextAncestors.push(ancestors[j]!);
    nextAncestors.push(page);
    assignAncestry(child, page, nextAncestors);
  }
}

export const buildDocsSite = (request: BuildRequest, docsLoaded: LoadedDocsConfig, outDir: string): int => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  const requestBaseURL = request.baseURL;
  if (requestBaseURL !== undefined && requestBaseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(requestBaseURL.trim());
  }

  const docsConfig = docsLoaded.config;
  if (docsConfig.siteName.trim() !== "") config.title = docsConfig.siteName.trim();

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir);
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.Combine(themeDir, "static"), outDir);
  }
  copyDirRecursive(Path.Combine(siteDir, "static"), outDir);

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];
  const site = new SiteContext(config, emptyPages, undefined, undefined);

  const baseTpl = selectTemplate(env, ["_default/baseof.html"]);
  const homeTpl = selectTemplate(env, ["index.html", "docs/home.html", "docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const listTpl = selectTemplate(env, ["docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const singleTpl = selectTemplate(env, ["docs/single.html", "_default/single.html"]) ?? "_default/single.html";

  const mountRootPages: PageContext[] = [];
  const allPagesForOutput: PageContext[] = [];
  const mountContexts: DocsMountContext[] = [];
  const searchDocs: SearchDoc[] = [];

  const mounts = docsConfig.mounts;
  for (let mountIndex = 0; mountIndex < mounts.length; mountIndex++) {
    const mount = mounts[mountIndex]!;
    const routes = scanMount(outDir, mount);
    const routeMap = new Map<string, string>();
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      const key = r.relPath.toLowerCase();
      routeMap.set(key, r.relPermalink);
    }
    mountContexts.push(new DocsMountContext(mount.name, mount.urlPrefix, loadMountNav(mount, routeMap)));

    const prefixSegs = mountPrefixSegments(mount.urlPrefix);
    const mountSection = prefixSegs.length > 0 ? prefixSegs[0]! : mount.name;

    const indexByDir = new Map<string, DocsMarkdownRoute>();
    const leafRoutes: DocsMarkdownRoute[] = [];
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      if (r.isIndex) {
        indexByDir.set(r.dirKey, r);
      } else {
        leafRoutes.push(r);
      }
    }

    const leafPagesByDir = new Map<string, PageContext[]>();
    const leafArr = leafRoutes;
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

      let list = leafPagesByDir.get(r.dirKey);
      if (list === undefined) {
        list = [];
        leafPagesByDir.set(r.dirKey, list);
      }
      list.push(ctx);
      allPagesForOutput.push(ctx);
      searchDocs.push(new SearchDoc(title, r.relPermalink, mount.name, plainText));
    }

    const dirSet = new Map<string, boolean>();
    addDirWithParents("", dirSet);
    for (const indexKey of indexByDir.keys()) addDirWithParents(indexKey, dirSet);
    for (const leafKey of leafPagesByDir.keys()) addDirWithParents(leafKey, dirSet);

    const childDirsByDir = new Map<string, string[]>();
    for (const childDirKey of dirSet.keys()) {
      if (childDirKey === "") continue;
      const parentKey = parentDirKey(childDirKey);
      let list = childDirsByDir.get(parentKey);
      if (list === undefined) {
        list = [];
        childDirsByDir.set(parentKey, list);
      }
      list.push(childDirKey);
    }

    const dirKeys: string[] = [];
    for (const collectedDirKey of dirSet.keys()) dirKeys.push(collectedDirKey);
    dirKeys.sort((a: string, b: string) => dirDepth(b) - dirDepth(a));

    const sectionByDir = new Map<string, PageContext>();

    for (let i = 0; i < dirKeys.length; i++) {
      const dirKey = dirKeys[i]!;

      const childPages: PageContext[] = [];

      const childDirList = childDirsByDir.get(dirKey);
      if (childDirList !== undefined) {
        childDirList.sort((a: string, b: string) => compareText(a, b));
        const childDirKeys = childDirList;
        for (let j = 0; j < childDirKeys.length; j++) {
          const childKey = childDirKeys[j]!;
          const childSection = sectionByDir.get(childKey);
          if (childSection !== undefined) childPages.push(childSection);
        }
      }

      const leafList = leafPagesByDir.get(dirKey);
      if (leafList !== undefined) {
        leafList.sort((a: PageContext, b: PageContext) => compareText(a.title, b.title));
        const leafPages = leafList;
        for (let j = 0; j < leafPages.length; j++) childPages.push(leafPages[j]!);
      }

      const routeSegments: string[] = dirKey === "" ? emptyStrings : dirKey.split("/");
      const urlParts: string[] = [];
      urlParts.push(mount.urlPrefix);
      for (let j = 0; j < routeSegments.length; j++) urlParts.push(routeSegments[j]!);
      const relPermalink = combineUrl(urlParts);

      const idxRoute = indexByDir.get(dirKey);

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

      if (idxRoute !== undefined) {
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
          searchDocs.push(new SearchDoc(title, relPermalink, mount.name, plainText));
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
        childPages,
        undefined,
        emptyPages,
        layout,
      );

      sectionByDir.set(dirKey, sectionCtx);
      allPagesForOutput.push(sectionCtx);
    }

    const mountRoot = sectionByDir.get("");
    if (mountRoot !== undefined) {
      mountRootPages.push(mountRoot);
    }
  }

  const mountRoots = mountRootPages;
  site.pages = mountRoots;
  site.docsMounts = mountContexts;

  const homeMount = docsConfig.homeMount;
  const chosenHome =
    homeMount !== undefined && homeMount.trim() !== ""
      ? homeMount.trim().toLowerCase()
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
    undefined,
  );

  assignAncestry(homeCtx, undefined, emptyPages);

  const homeHtml = renderWithBase(env, baseTpl, homeTpl, homeCtx);
  writeTextFile(Path.Combine(outDir, "index.html"), homeHtml);

  let pagesBuilt: int = 1;

  // Render all docs pages (skip the home page, which is always /index.html).
  const allPages = allPagesForOutput;
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
      const json = renderSearchIndexJson(searchDocs);
      writeTextFile(Path.Combine(outDir, name), json);
      pagesBuilt++;
    }
  }

  return pagesBuilt;
};
