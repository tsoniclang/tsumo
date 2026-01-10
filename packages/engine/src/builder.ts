import { DateTime } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import type { char, int } from "@tsonic/core/types.js";
import { BuildRequest, BuildResult, PageContext, SiteContext, SiteConfig } from "./models.ts";
import { renderRobotsTxt, renderRss, renderSitemap } from "./outputs.ts";
import { loadSiteConfig } from "./config.ts";
import { parseContent } from "./frontmatter.ts";
import { copyDirRecursive, deleteDirRecursive, ensureDir, fileExists, readTextFile, writeTextFile } from "./fs.ts";
import { LayoutEnvironment } from "./layouts.ts";
import { renderMarkdown } from "./markdown.ts";
import { HtmlString } from "./utils/html.ts";
import { ensureTrailingSlash, humanizeSlug, slugify } from "./utils/text.ts";

class ContentPageBuild {
  readonly sourcePath: string;
  readonly section: string;
  readonly type: string;
  readonly slug: string;
  readonly title: string;
  readonly dateUtc: DateTime;
  readonly dateString: string;
  readonly draft: boolean;
  readonly description: string;
  readonly tags: string[];
  readonly categories: string[];
  readonly Params: Dictionary<string, string>;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly relPermalink: string;
  readonly outputRelPath: string;
  readonly layout: string | undefined;

  constructor(
    sourcePath: string,
    section: string,
    type: string,
    slug: string,
    title: string,
    dateUtc: DateTime,
    dateString: string,
    draft: boolean,
    description: string,
    tags: string[],
    categories: string[],
    parameters: Dictionary<string, string>,
    content: HtmlString,
    summary: HtmlString,
    relPermalink: string,
    outputRelPath: string,
    layout: string | undefined,
  ) {
    this.sourcePath = sourcePath;
    this.section = section;
    this.type = type;
    this.slug = slug;
    this.title = title;
    this.dateUtc = dateUtc;
    this.dateString = dateString;
    this.draft = draft;
    this.description = description;
    this.tags = tags;
    this.categories = categories;
    this.Params = parameters;
    this.content = content;
    this.summary = summary;
    this.relPermalink = relPermalink;
    this.outputRelPath = outputRelPath;
    this.layout = layout;
  }
}

class ListPageContent {
  readonly title: string | undefined;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly description: string;
  readonly type: string | undefined;
  readonly Params: Dictionary<string, string>;
  readonly sourceDir: string;

  constructor(
    title: string | undefined,
    content: HtmlString,
    summary: HtmlString,
    description: string,
    type: string | undefined,
    parameters: Dictionary<string, string>,
    sourceDir: string,
  ) {
    this.title = title;
    this.content = content;
    this.summary = summary;
    this.description = description;
    this.type = type;
    this.Params = parameters;
    this.sourceDir = sourceDir;
  }
}

const normalizeSlashes = (path: string): string => path.replace("\\", "/");

const splitPath = (relativePath: string): string[] => normalizeSlashes(relativePath).split("/");

const isBranchIndexFile = (name: string): boolean => name.toLowerInvariant() === "_index.md";

const isLeafBundleIndexFile = (name: string): boolean => name.toLowerInvariant() === "index.md";

const withoutMdExtension = (fileName: string): string => {
  const lower = fileName.toLowerInvariant();
  return lower.endsWith(".md") ? fileName.substring(0, fileName.length - 3) : fileName;
};

const joinUrlPath = (parts: string[]): string => {
  if (parts.length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += "/" + parts[i]!;
  return out;
};

const containsSlash = (s: string): boolean => {
  const idx = s.indexOf("/");
  return idx >= 0;
};

const combineOutputRelPath = (urlParts: string[]): string => {
  if (urlParts.length === 0) return "index.html";
  let p = urlParts[0]!;
  for (let i = 1; i < urlParts.length; i++) {
    p = Path.combine(p, urlParts[i]!);
  }
  return Path.combine(p, "index.html");
};

const isBundleDir = (dir: string): boolean => File.exists(Path.combine(dir, "index.md")) || File.exists(Path.combine(dir, "_index.md"));

const copyBundleResources = (srcDir: string, destDir: string): void => {
  if (!Directory.exists(srcDir)) return;
  Directory.createDirectory(destDir);

  const files = Directory.getFiles(srcDir, "*", SearchOption.topDirectoryOnly);
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i]!;
    if (srcFile.toLowerInvariant().endsWith(".md")) continue;
    const destFile = Path.combine(destDir, Path.getFileName(srcFile) ?? "");
    File.copy(srcFile, destFile, true);
  }

  const dirs = Directory.getDirectories(srcDir, "*", SearchOption.topDirectoryOnly);
  for (let i = 0; i < dirs.length; i++) {
    const child = dirs[i]!;
    if (isBundleDir(child)) continue;
    if (Directory.getFiles(child, "*.md", SearchOption.topDirectoryOnly).length > 0) continue;
    const childName = Path.getFileName(child);
    if (childName === undefined || childName === "") continue;
    copyBundleResources(child, Path.combine(destDir, childName));
  }
};

const combineUrl = (parts: string[]): string => {
  const slash: char = "/";
  const sb = new List<string>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!.trim();
    if (p !== "") sb.add(p.trimStart(slash).trimEnd(slash));
  }
  const arr = sb.toArray();
  let out = "/";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i]!;
    if (!out.endsWith("/")) out += "/";
  }
  return out === "//" ? "/" : out;
};

const resolveThemeDir = (siteDir: string, config: SiteConfig): string | undefined => {
  if (config.theme === undefined) return undefined;
  const themeName = config.theme.trim();
  if (themeName === "") return undefined;
  const dir = Path.combine(siteDir, "themes", themeName);
  return Directory.exists(dir) ? dir : undefined;
};

const selectTemplate = (env: LayoutEnvironment, candidates: string[]): string | undefined => {
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]!;
    const t = env.getTemplate(p);
    if (t !== undefined) return p;
  }
  return undefined;
};

const renderWithBase = (env: LayoutEnvironment, basePath: string | undefined, mainPath: string, ctx: PageContext): string => {
  const main = env.getTemplate(mainPath);
  if (main === undefined) return "";

  if (basePath !== undefined) {
    const base = env.getTemplate(basePath);
    if (base !== undefined && main.defines.count > 0) {
      return base.render(ctx, env, main.defines);
    }
  }

  return main.render(ctx, env);
};

export const buildSite = (request: BuildRequest): BuildResult => {
  const siteDir = Path.getFullPath(request.siteDir);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  if (request.baseURL !== undefined && request.baseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(request.baseURL.trim());
  }

  const themeDir = resolveThemeDir(siteDir, config);
  const env = new LayoutEnvironment(siteDir, themeDir);

  const outDir = Path.isPathRooted(request.destinationDir)
    ? request.destinationDir
    : Path.combine(siteDir, request.destinationDir);

  if (request.cleanDestinationDir) {
    deleteDirRecursive(outDir);
  }
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.combine(themeDir, "static"), outDir);
  }
  const staticDir = Path.combine(siteDir, "static");
  copyDirRecursive(staticDir, outDir);

  const contentDir = Path.combine(siteDir, "content");
  const emptyFiles: string[] = [];
  const mdFiles: string[] = Directory.exists(contentDir)
    ? Directory.getFiles(contentDir, "*.md", SearchOption.allDirectories)
    : emptyFiles;

  const pages = new List<ContentPageBuild>();
  const listIndex = new Dictionary<string, ListPageContent>();

  for (let i = 0; i < mdFiles.length; i++) {
    const filePath = mdFiles[i]!;
    const rel = normalizeSlashes(Path.getRelativePath(contentDir, filePath));
    const parts = splitPath(rel);
    const fileName = parts.length > 0 ? parts[parts.length - 1]! : rel;

    const dirPartsList = new List<string>();
    for (let j = 0; j < parts.length - 1; j++) dirPartsList.add(parts[j]!);
    const dirParts = dirPartsList.toArray();
    const dirRel = joinUrlPath(dirParts);

    const parsed = parseContent(readTextFile(filePath));
    const md = renderMarkdown(parsed.body);
    const fm = parsed.frontMatter;

    const dateUtc = fm.date ?? File.getLastWriteTimeUtc(filePath);
    const dateString = dateUtc.toString("O");

    const content = new HtmlString(md.html);
    const summary = new HtmlString(md.summaryHtml);

    const pageParams = fm.Params;

    if (isBranchIndexFile(fileName)) {
      const srcDir = Path.getDirectoryName(filePath) ?? contentDir;
      listIndex.remove(dirRel);
      listIndex.add(dirRel, new ListPageContent(fm.title, content, summary, fm.description ?? "", fm.type, pageParams, srcDir));
      continue;
    }

    const section = dirParts.length > 0 ? dirParts[0]! : "";
    let pageType = fm.type;
    if (pageType === undefined || pageType.trim() === "") {
      pageType = section !== "" ? section : "page";
    }

    const isLeafBundle = isLeafBundleIndexFile(fileName) && dirParts.length > 0;
    const defaultLeafName = isLeafBundle ? dirParts[dirParts.length - 1]! : withoutMdExtension(fileName);
    const title = fm.title ?? humanizeSlug(defaultLeafName);

    const slug = fm.slug ?? slugify(defaultLeafName);
    const urlPartsList = new List<string>();
    if (isLeafBundle === true) {
      for (let j = 0; j < dirParts.length - 1; j++) urlPartsList.add(dirParts[j]!);
      urlPartsList.add(slug);
    } else {
      for (let j = 0; j < dirParts.length; j++) urlPartsList.add(dirParts[j]!);
      urlPartsList.add(slug);
    }
    const urlParts = urlPartsList.toArray();

    const relPermalink = combineUrl(urlParts);
    const outputRelPath = combineOutputRelPath(urlParts);

    const page = new ContentPageBuild(
      filePath,
      section,
      pageType,
      slug,
      title,
      dateUtc,
      dateString,
      fm.draft,
      fm.description ?? "",
      fm.tags,
      fm.categories,
      pageParams,
      content,
      summary,
      relPermalink,
      outputRelPath,
      fm.layout,
    );

    if (!page.draft || request.buildDrafts) pages.add(page);
  }

  pages.sort((a: ContentPageBuild, b: ContentPageBuild) => DateTime.compare(b.dateUtc, a.dateUtc));

  const emptyPages: PageContext[] = [];
  const emptyStrings: string[] = [];
  const site = new SiteContext(config, emptyPages);
  const pageContexts = new List<PageContext>();
  const bySection = new Dictionary<string, List<PageContext>>();

  const pageBuilds = pages.toArray();
  for (let i = 0; i < pageBuilds.length; i++) {
    const p = pageBuilds[i]!;
    const ctx = new PageContext(
      p.title,
      p.dateString,
      p.draft,
      "page",
      p.section,
      p.type,
      p.slug,
      p.relPermalink,
      p.content,
      p.summary,
      p.description,
      p.tags,
      p.categories,
      p.Params,
      site,
      emptyPages,
    );
    pageContexts.add(ctx);

    let sectionPages = new List<PageContext>();
    const hasSection = bySection.tryGetValue(p.section, sectionPages);
    if (!hasSection) {
      sectionPages = new List<PageContext>();
      bySection.remove(p.section);
      bySection.add(p.section, sectionPages);
    }
    sectionPages.add(ctx);
  }

  const pageContextArr = pageContexts.toArray();
  site.pages = pageContextArr;

  const baseCandidates = ["_default/baseof.html"];

  const homeCandidates = ["index.html", "_default/list.html"];
  const listCandidates = ["_default/list.html"];
  const singleCandidates = ["_default/single.html"];

  const homeTpl = selectTemplate(env, homeCandidates) ?? homeCandidates[1]!;
  const listTpl = selectTemplate(env, listCandidates) ?? listCandidates[0]!;
  const singleTpl = selectTemplate(env, singleCandidates) ?? singleCandidates[0]!;
  const baseTpl = selectTemplate(env, baseCandidates);

  let pagesBuilt = 0;
  const sitemapUrlSet = new Dictionary<string, boolean>();

  let homeTitle = config.title;
  let homeContent = new HtmlString("");
  let homeSummary = new HtmlString("");
  let homeDescription = "";
  let homeType = "home";
  let homeParams = new Dictionary<string, string>();
  let homeSourceDir: string | undefined = undefined;

  const homeIdxValue = new ListPageContent(undefined, homeContent, homeSummary, "", undefined, homeParams, contentDir);
  const hasHomeIdx = listIndex.tryGetValue("", homeIdxValue);
  if (hasHomeIdx) {
    if (homeIdxValue.title !== undefined) homeTitle = homeIdxValue.title;
    homeContent = homeIdxValue.content;
    homeSummary = homeIdxValue.summary;
    homeDescription = homeIdxValue.description;
    homeType = homeIdxValue.type ?? "home";
    homeParams = homeIdxValue.Params;
    homeSourceDir = homeIdxValue.sourceDir;
  }

  const homeCtx = new PageContext(
    homeTitle,
    "",
    false,
    "home",
    "",
    homeType,
    "",
    "/",
    homeContent,
    homeSummary,
    homeDescription,
    emptyStrings,
    emptyStrings,
    homeParams,
    site,
    site.pages,
  );

  const homeHtml = renderWithBase(env, baseTpl, homeTpl, homeCtx);
  writeTextFile(Path.combine(outDir, "index.html"), homeHtml);
  pagesBuilt++;
  sitemapUrlSet.remove("/");
  sitemapUrlSet.add("/", true);
  if (homeSourceDir !== undefined) copyBundleResources(homeSourceDir, outDir);

  const sectionKeySet = new Dictionary<string, boolean>();
  const keysIt = bySection.keys.getEnumerator();
  while (keysIt.moveNext()) {
    const k = keysIt.current;
    if (k !== "") {
      sectionKeySet.remove(k);
      sectionKeySet.add(k, true);
    }
  }
  const listKeysIt = listIndex.keys.getEnumerator();
  while (listKeysIt.moveNext()) {
    const listKey = listKeysIt.current;
    const hasSlash = containsSlash(listKey);
    if (listKey === "" || hasSlash) continue;
    sectionKeySet.remove(listKey);
    sectionKeySet.add(listKey, true);
  }

  const sectionKeysList = new List<string>();
  const sectionKeysIt = sectionKeySet.keys.getEnumerator();
  while (sectionKeysIt.moveNext()) sectionKeysList.add(sectionKeysIt.current);
  const sectionKeys = sectionKeysList.toArray();

  for (let i = 0; i < sectionKeys.length; i++) {
    const section = sectionKeys[i]!;

    let list: PageContext[] = emptyPages;
    const sectionPages = new List<PageContext>();
    const ok = bySection.tryGetValue(section, sectionPages);
    if (ok) list = sectionPages.toArray();

    let title = humanizeSlug(section);
    let content = new HtmlString("");
    let summary = new HtmlString("");
    let description = "";
    let listType = section;
    let listParams = new Dictionary<string, string>();
    let listSourceDir: string | undefined = undefined;

    const idxValue = new ListPageContent(undefined, content, summary, "", undefined, listParams, contentDir);
    const hasIdx = listIndex.tryGetValue(section, idxValue);
    if (hasIdx) {
      if (idxValue.title !== undefined) title = idxValue.title;
      content = idxValue.content;
      summary = idxValue.summary;
      description = idxValue.description;
      listType = idxValue.type ?? section;
      listParams = idxValue.Params;
      listSourceDir = idxValue.sourceDir;
    }

    const ctx = new PageContext(
      title,
      "",
      false,
      "section",
      section,
      listType,
      section,
      combineUrl([section]),
      content,
      summary,
      description,
      emptyStrings,
      emptyStrings,
      listParams,
      site,
      list,
    );

    const relOut = Path.combine(section, "index.html");
    const mainPath = selectTemplate(env, [`${listType}/list.html`, `${section}/list.html`, "_default/list.html"]) ?? listTpl;
    const basePath = selectTemplate(env, [`${listType}/baseof.html`, `${section}/baseof.html`, "_default/baseof.html"]) ?? baseTpl;
    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.combine(outDir, relOut), html);
    pagesBuilt++;
    sitemapUrlSet.remove(ctx.relPermalink);
    sitemapUrlSet.add(ctx.relPermalink, true);
    if (listSourceDir !== undefined) copyBundleResources(listSourceDir, Path.combine(outDir, section));
  }

  const listDirKeys = new List<string>();
  const nestedKeysIt = listIndex.keys.getEnumerator();
  while (nestedKeysIt.moveNext()) {
    const dirKey = nestedKeysIt.current;
    const hasSlash = containsSlash(dirKey);
    if (dirKey === "" || !hasSlash) continue;
    listDirKeys.add(dirKey);
  }

  const nestedListDirs = listDirKeys.toArray();
  for (let i = 0; i < nestedListDirs.length; i++) {
    const dirKey = nestedListDirs[i]!;
    const urlPrefix = combineUrl(splitPath(dirKey));

    const listPages = new List<PageContext>();
    for (let j = 0; j < pageContextArr.length; j++) {
      const p = pageContextArr[j]!;
      if (p.relPermalink.startsWith(urlPrefix)) listPages.add(p);
    }

    const dirParts = splitPath(dirKey);
    const leaf = dirParts.length > 0 ? dirParts[dirParts.length - 1]! : dirKey;
    const section = dirParts.length > 0 ? dirParts[0]! : "";

    let title = humanizeSlug(leaf);
    let content = new HtmlString("");
    let summary = new HtmlString("");
    let description = "";
    let listType = section !== "" ? section : "section";
    let listParams = new Dictionary<string, string>();
    let listSourceDir: string | undefined = undefined;

    const idxValue = new ListPageContent(undefined, content, summary, "", undefined, listParams, contentDir);
    const hasIdx = listIndex.tryGetValue(dirKey, idxValue);
    if (hasIdx) {
      if (idxValue.title !== undefined) title = idxValue.title;
      content = idxValue.content;
      summary = idxValue.summary;
      description = idxValue.description;
      listType = idxValue.type ?? listType;
      listParams = idxValue.Params;
      listSourceDir = idxValue.sourceDir;
    }

    const ctx = new PageContext(
      title,
      "",
      false,
      "section",
      section,
      listType,
      leaf,
      urlPrefix,
      content,
      summary,
      description,
      emptyStrings,
      emptyStrings,
      listParams,
      site,
      listPages.toArray(),
    );

    const outRel = combineOutputRelPath(dirParts);
    const mainPath = selectTemplate(env, [`${listType}/list.html`, `${section}/list.html`, "_default/list.html"]) ?? listTpl;
    const basePath = selectTemplate(env, [`${listType}/baseof.html`, `${section}/baseof.html`, "_default/baseof.html"]) ?? baseTpl;
    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.combine(outDir, outRel), html);
    pagesBuilt++;
    sitemapUrlSet.remove(ctx.relPermalink);
    sitemapUrlSet.add(ctx.relPermalink, true);

    if (listSourceDir !== undefined) {
      const slash: char = "/";
      const destDir = Path.combine(outDir, dirKey.replace(slash, Path.directorySeparatorChar));
      copyBundleResources(listSourceDir, destDir);
    }
  }

  const buildTaxonomy = (taxonomy: string, getTerms: (page: PageContext) => string[]): void => {
    const byTerm = new Dictionary<string, List<PageContext>>();

    for (let i = 0; i < pageContextArr.length; i++) {
      const page = pageContextArr[i]!;
      const terms = getTerms(page);
      for (let j = 0; j < terms.length; j++) {
        const raw = terms[j]!;
        const termText = raw.trim();
        if (termText === "") continue;
        const termSlug = slugify(termText);
        if (termSlug === "") continue;

        let termPages = new List<PageContext>();
        const hasTerm = byTerm.tryGetValue(termSlug, termPages);
        if (!hasTerm) {
          termPages = new List<PageContext>();
          byTerm.remove(termSlug);
          byTerm.add(termSlug, termPages);
        }
        termPages.add(page);
      }
    }

    const termKeys = new List<string>();
    const keysIt = byTerm.keys.getEnumerator();
    while (keysIt.moveNext()) termKeys.add(keysIt.current);
    termKeys.sort();

    const emptyHtml = new HtmlString("");
    const termPagesOut = new List<PageContext>();

    const termSlugs = termKeys.toArray();
    for (let i = 0; i < termSlugs.length; i++) {
      const termSlug = termSlugs[i]!;
      const pagesForTermList = new List<PageContext>();
      const ok = byTerm.tryGetValue(termSlug, pagesForTermList);
      if (!ok) continue;
      const pagesForTerm = pagesForTermList.toArray();

      const termParams = new Dictionary<string, string>();
      termParams.remove("term");
      termParams.add("term", termSlug);
      termParams.remove("taxonomy");
      termParams.add("taxonomy", taxonomy);

      const ctx = new PageContext(
        humanizeSlug(termSlug),
        "",
        false,
        "term",
        taxonomy,
        taxonomy,
        termSlug,
        combineUrl([taxonomy, termSlug]),
        emptyHtml,
        emptyHtml,
        "",
        emptyStrings,
        emptyStrings,
        termParams,
        site,
        pagesForTerm,
      );

      termPagesOut.add(ctx);

      const outRel = Path.combine(taxonomy, termSlug, "index.html");
      const mainPath =
        selectTemplate(env, [`${taxonomy}/taxonomy.html`, "taxonomy/taxonomy.html", "_default/taxonomy.html", "_default/list.html"]) ?? listTpl;
      const basePath =
        selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
      const html = renderWithBase(env, basePath, mainPath, ctx);
      writeTextFile(Path.combine(outDir, outRel), html);
      pagesBuilt++;
      sitemapUrlSet.remove(ctx.relPermalink);
      sitemapUrlSet.add(ctx.relPermalink, true);
    }

    const taxParams = new Dictionary<string, string>();
    taxParams.remove("taxonomy");
    taxParams.add("taxonomy", taxonomy);

    const taxCtx = new PageContext(
      humanizeSlug(taxonomy),
      "",
      false,
      "taxonomy",
      taxonomy,
      taxonomy,
      taxonomy,
      combineUrl([taxonomy]),
      emptyHtml,
      emptyHtml,
      "",
      emptyStrings,
      emptyStrings,
      taxParams,
      site,
      termPagesOut.toArray(),
    );

    const taxOutRel = Path.combine(taxonomy, "index.html");
    const taxMainPath =
      selectTemplate(env, [`${taxonomy}/terms.html`, "taxonomy/terms.html", "_default/terms.html", "_default/list.html"]) ?? listTpl;
    const taxBasePath =
      selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
    const taxHtml = renderWithBase(env, taxBasePath, taxMainPath, taxCtx);
    writeTextFile(Path.combine(outDir, taxOutRel), taxHtml);
    pagesBuilt++;
    sitemapUrlSet.remove(taxCtx.relPermalink);
    sitemapUrlSet.add(taxCtx.relPermalink, true);
  };

  buildTaxonomy("tags", (page: PageContext) => page.tags);
  buildTaxonomy("categories", (page: PageContext) => page.categories);

  const singles = pageBuilds;
  for (let i = 0; i < singles.length; i++) {
    const p = singles[i]!;

    const ctx = pageContextArr[i]!;

    const templateType = p.type !== "" ? p.type : p.section;
    const layoutCandidates = p.layout !== undefined && p.layout.trim() !== ""
      ? [
          `${templateType}/${p.layout}.html`,
          `${p.section}/${p.layout}.html`,
          `_default/${p.layout}.html`,
          `${p.layout}.html`,
          `${templateType}/single.html`,
          `${p.section}/single.html`,
          "_default/single.html",
        ]
      : [`${templateType}/single.html`, p.section !== "" ? `${p.section}/single.html` : "_default/single.html", "_default/single.html"];

    const mainPath = selectTemplate(env, layoutCandidates) ?? singleTpl;
    const basePath = selectTemplate(
      env,
      templateType !== "" ? [`${templateType}/baseof.html`, `${p.section}/baseof.html`, "_default/baseof.html"] : ["_default/baseof.html"],
    );

    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.combine(outDir, p.outputRelPath), html);
    pagesBuilt++;
    sitemapUrlSet.remove(ctx.relPermalink);
    sitemapUrlSet.add(ctx.relPermalink, true);

    if (isLeafBundleIndexFile(Path.getFileName(p.sourcePath) ?? "") && Path.getDirectoryName(p.sourcePath) !== undefined) {
      const destDir = Path.getDirectoryName(Path.combine(outDir, p.outputRelPath));
      if (destDir !== undefined && destDir !== "") {
        copyBundleResources(Path.getDirectoryName(p.sourcePath)!, destDir);
      }
    }
  }

  const rels = new List<string>();
  const relIt = sitemapUrlSet.keys.getEnumerator();
  while (relIt.moveNext()) rels.add(relIt.current);
  const relArr = rels.toArray();

  const sitemapPath = Path.combine(outDir, "sitemap.xml");
  if (!File.exists(sitemapPath)) {
    writeTextFile(sitemapPath, renderSitemap(config, relArr));
    pagesBuilt++;
  }

  const rssPath = Path.combine(outDir, "index.xml");
  if (!File.exists(rssPath)) {
    writeTextFile(rssPath, renderRss(config, site.pages));
    pagesBuilt++;
  }

  const robotsPath = Path.combine(outDir, "robots.txt");
  if (!File.exists(robotsPath)) {
    writeTextFile(robotsPath, renderRobotsTxt(config));
    pagesBuilt++;
  }

  return new BuildResult(outDir, pagesBuilt);
};
