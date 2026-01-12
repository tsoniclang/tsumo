import { DateTime } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import type { char, int } from "@tsonic/core/types.js";
import { BuildRequest, BuildResult, LanguageContext, MenuEntry, PageContext, PageFile, SiteContext, SiteConfig } from "./models.ts";
import { ParamValue } from "./params.ts";
import { renderRobotsTxt, renderRss, renderSitemap } from "./outputs.ts";
import { loadSiteConfig } from "./config.ts";
import { loadDocsConfig } from "./docs/config.ts";
import { parseContent, FrontMatterMenu } from "./frontmatter.ts";
import { copyDirRecursive, deleteDirRecursive, ensureDir, fileExists, readTextFile, writeTextFile } from "./fs.ts";
import { BuildEnvironment } from "./env.ts";
import { renderMarkdownWithShortcodes } from "./markdown.ts";
import { HtmlString } from "./utils/html.ts";
import { ensureTrailingSlash, humanizeSlug, slugify } from "./utils/text.ts";
import { combineUrl, renderWithBase, resolveThemeDir, selectTemplate } from "./build/layout.ts";
import { buildDocsSite } from "./docs/builder.ts";
import { buildMenuHierarchy, flattenMenuEntries } from "./menus.ts";

class ContentPageBuild {
  readonly sourcePath: string;
  readonly section: string;
  readonly type: string;
  readonly slug: string;
  readonly title: string;
  readonly dateUtc: DateTime;
  readonly dateString: string;
  readonly lastmodString: string;
  readonly draft: boolean;
  readonly description: string;
  readonly tags: string[];
  readonly categories: string[];
  readonly Params: Dictionary<string, ParamValue>;
  readonly rawBody: string;
  readonly relPermalink: string;
  readonly outputRelPath: string;
  readonly layout: string | undefined;
  readonly file: PageFile;
  readonly menus: FrontMatterMenu[];

  constructor(
    sourcePath: string,
    section: string,
    type: string,
    slug: string,
    title: string,
    dateUtc: DateTime,
    dateString: string,
    lastmodString: string,
    draft: boolean,
    description: string,
    tags: string[],
    categories: string[],
    parameters: Dictionary<string, ParamValue>,
    rawBody: string,
    relPermalink: string,
    outputRelPath: string,
    layout: string | undefined,
    file: PageFile,
    menus: FrontMatterMenu[],
  ) {
    this.sourcePath = sourcePath;
    this.section = section;
    this.type = type;
    this.slug = slug;
    this.title = title;
    this.dateUtc = dateUtc;
    this.dateString = dateString;
    this.lastmodString = lastmodString;
    this.draft = draft;
    this.description = description;
    this.tags = tags;
    this.categories = categories;
    this.Params = parameters;
    this.rawBody = rawBody;
    this.relPermalink = relPermalink;
    this.outputRelPath = outputRelPath;
    this.layout = layout;
    this.file = file;
    this.menus = menus;
  }
}

class ListPageContent {
  readonly title: string | undefined;
  readonly rawBody: string;
  readonly description: string;
  readonly type: string | undefined;
  readonly layout: string | undefined;
  readonly Params: Dictionary<string, ParamValue>;
  readonly sourceDir: string;
  readonly file: PageFile | undefined;

  constructor(
    title: string | undefined,
    rawBody: string,
    description: string,
    type: string | undefined,
    layout: string | undefined,
    parameters: Dictionary<string, ParamValue>,
    sourceDir: string,
    file?: PageFile,
  ) {
    this.title = title;
    this.rawBody = rawBody;
    this.description = description;
    this.type = type;
    this.layout = layout;
    this.Params = parameters;
    this.sourceDir = sourceDir;
    this.file = file;
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

const buildPageFile = (dirKey: string, fileName: string, filePath: string): PageFile => {
  const slash: char = "/";
  const dir = dirKey === "" ? "" : dirKey.trimEnd(slash) + "/";
  return new PageFile(Path.getFullPath(filePath), dir, withoutMdExtension(fileName));
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

// Find a page by its path reference
const findPageByRef = (pages: PageContext[], pageRef: string): PageContext | undefined => {
  const slash: char = "/";
  const normalizedRef = pageRef.trim().trimStart(slash).trimEnd(slash).toLowerInvariant();
  if (normalizedRef === "") return undefined;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const normalizedPermalink = page.relPermalink.trimStart(slash).trimEnd(slash).toLowerInvariant();
    if (normalizedPermalink === normalizedRef) return page;
  }

  // Also try matching by section/slug pattern
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    // Check if pageRef matches the slug
    if (page.slug.toLowerInvariant() === normalizedRef) return page;
    // Check section/slug pattern
    const sectionSlug = (page.section + "/" + page.slug).toLowerInvariant();
    if (sectionSlug === normalizedRef) return page;
  }

  return undefined;
};

// Resolve pageRef for a menu entry and its children recursively
const resolveMenuEntryPageRef = (entry: MenuEntry, pages: PageContext[]): void => {
  if (entry.pageRef !== "" && entry.page === undefined) {
    const resolved = findPageByRef(pages, entry.pageRef);
    if (resolved !== undefined) {
      entry.page = resolved;
    }
  }
  // Resolve children recursively
  for (let i = 0; i < entry.children.length; i++) {
    resolveMenuEntryPageRef(entry.children[i]!, pages);
  }
};

// Resolve pageRefs for all menu entries in a site
const resolveMenuPageRefs = (site: SiteContext): void => {
  const pages = site.pages;
  const menus = site.Menus;
  const menuKeys = menus.keys.getEnumerator();
  while (menuKeys.moveNext()) {
    const menuName = menuKeys.current;
    let entries: MenuEntry[] = [];
    const hasEntries = menus.tryGetValue(menuName, entries);
    if (hasEntries) {
      for (let i = 0; i < entries.length; i++) {
        resolveMenuEntryPageRef(entries[i]!, pages);
      }
    }
  }
  menuKeys.dispose();
};

// Menu helpers imported from menus.ts

const integrateFrontmatterMenus = (
  pageBuilds: ContentPageBuild[],
  site: SiteContext,
): void => {
  // Build a dictionary of pages keyed by lowercase filename for safe lookup
  const pagesByFilename = new Dictionary<string, PageContext>();
  const allPages = site.pages;
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i]!;
    if (page.File !== undefined) {
      const key = page.File.Filename.toLowerInvariant();
      pagesByFilename.remove(key);
      pagesByFilename.add(key, page);
    }
  }

  // Collect all frontmatter menu entries per menu name
  const frontmatterEntriesPerMenu = new Dictionary<string, List<MenuEntry>>();

  for (let i = 0; i < pageBuilds.length; i++) {
    const pageBuild = pageBuilds[i]!;
    if (pageBuild.menus.length === 0) continue;

    // Look up the page context by filename
    const filenameKey = pageBuild.file.Filename.toLowerInvariant();
    let pageContext: PageContext = allPages[0]!;
    const foundPage = pagesByFilename.tryGetValue(filenameKey, pageContext);
    if (!foundPage) continue;

    for (let j = 0; j < pageBuild.menus.length; j++) {
      const fmMenu = pageBuild.menus[j]!;
      const menuName = fmMenu.menu;

      // Create MenuEntry from frontmatter menu with page reference
      const entry = new MenuEntry(
        fmMenu.name !== "" ? fmMenu.name : pageContext.title,
        "", // url is empty - will use page's relPermalink
        "", // pageRef is empty - we have the page directly
        fmMenu.title,
        fmMenu.weight,
        fmMenu.parent,
        fmMenu.identifier !== "" ? fmMenu.identifier : pageContext.relPermalink,
        fmMenu.pre,
        fmMenu.post,
        menuName,
      );
      entry.page = pageContext;

      // Add to collection for this menu
      let entryList: List<MenuEntry> = new List<MenuEntry>();
      const hasEntries = frontmatterEntriesPerMenu.tryGetValue(menuName, entryList);
      if (!hasEntries) {
        entryList = new List<MenuEntry>();
        frontmatterEntriesPerMenu.add(menuName, entryList);
      }
      entryList.add(entry);
    }
  }

  // For each menu with frontmatter entries, merge with existing config entries and rebuild hierarchy
  const menuNamesList = new List<string>();
  const keysIt = frontmatterEntriesPerMenu.keys.getEnumerator();
  while (keysIt.moveNext()) menuNamesList.add(keysIt.current);
  keysIt.dispose();
  const menuNames = menuNamesList.toArray();
  for (let i = 0; i < menuNames.length; i++) {
    const menuName = menuNames[i]!;

    // Get existing menu entries (may already have hierarchy from config)
    let existingEntries: MenuEntry[] = [];
    const hasExisting = site.Menus.tryGetValue(menuName, existingEntries);

    // Flatten existing entries to break apart any hierarchy
    let flatExisting: MenuEntry[] = [];
    if (hasExisting) {
      flatExisting = flattenMenuEntries(existingEntries);
    }

    // Get frontmatter entries for this menu
    let fmEntryList: List<MenuEntry> = new List<MenuEntry>();
    frontmatterEntriesPerMenu.tryGetValue(menuName, fmEntryList);
    const fmEntries = fmEntryList.toArray();

    // Combine all entries into a flat list
    const combined = new List<MenuEntry>();
    for (let j = 0; j < flatExisting.length; j++) {
      const entry = flatExisting[j]!;
      combined.add(entry);
    }
    for (let j = 0; j < fmEntries.length; j++) {
      const entry = fmEntries[j]!;
      combined.add(entry);
    }

    // Rebuild hierarchy from combined flat list (order-independent)
    const hierarchical = buildMenuHierarchy(combined.toArray());

    // Update the site's menu
    site.Menus.remove(menuName);
    site.Menus.add(menuName, hierarchical);
  }
};

export const buildSite = (request: BuildRequest): BuildResult => {
  const siteDir = Path.getFullPath(request.siteDir);
  const docs = loadDocsConfig(siteDir);
  if (docs !== undefined) return buildDocsSite(request, docs);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  if (request.baseURL !== undefined && request.baseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(request.baseURL.trim());
  }

  const outDir = Path.isPathRooted(request.destinationDir)
    ? request.destinationDir
    : Path.combine(siteDir, request.destinationDir);

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir);

  if (request.cleanDestinationDir) {
    deleteDirRecursive(outDir);
  }
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.combine(themeDir, "static"), outDir);
  }
  const staticDir = Path.combine(siteDir, "static");
  copyDirRecursive(staticDir, outDir);

  const contentDir = Path.combine(siteDir, config.contentDir);
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
    const fm = parsed.frontMatter;

    const dateUtc = fm.date ?? File.getLastWriteTimeUtc(filePath);
    const dateString = dateUtc.toString("O");
    const lastmodString = File.getLastWriteTimeUtc(filePath).toString("O");

    const pageParams = fm.Params;
    const file = buildPageFile(dirRel, fileName, filePath);

    if (isBranchIndexFile(fileName)) {
      const srcDir = Path.getDirectoryName(filePath) ?? contentDir;
      listIndex.remove(dirRel);
      listIndex.add(dirRel, new ListPageContent(fm.title, parsed.body, fm.description ?? "", fm.type, fm.layout, pageParams, srcDir, file));
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
      lastmodString,
      fm.draft,
      fm.description ?? "",
      fm.tags,
      fm.categories,
      pageParams,
      parsed.body,
      relPermalink,
      outputRelPath,
      fm.layout,
      file,
      fm.menus,
    );

    if (!page.draft || request.buildDrafts) pages.add(page);
  }

  pages.sort((a: ContentPageBuild, b: ContentPageBuild) => DateTime.compare(b.dateUtc, a.dateUtc));

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];

  // Build language contexts for multilingual support
  const allLanguages = new List<LanguageContext>();
  if (config.languages.length > 0) {
    for (let i = 0; i < config.languages.length; i++) {
      const langConfig = config.languages[i]!;
      allLanguages.add(new LanguageContext(langConfig.lang, langConfig.languageName, langConfig.languageDirection));
    }
  }

  // Create site with multilingual settings
  // For now, build the default (first) language; full multilingual build will iterate through all
  const currentLang = config.languages.length > 0 ? config.languages[0] : undefined;
  const site = new SiteContext(config, emptyPages, currentLang, allLanguages.count > 0 ? allLanguages.toArray() : undefined);

  // Set up Sites array (for now, just this site; full implementation would have all language sites)
  const allSites: SiteContext[] = [site];
  site.Sites = allSites;

  const pageContexts = new List<PageContext>();
  const bySection = new Dictionary<string, List<PageContext>>();
  const pageRawBodies = new Dictionary<PageContext, string>();
  const placeholderHtml = new HtmlString("");

  const pageBuilds = pages.toArray();
  for (let i = 0; i < pageBuilds.length; i++) {
    const p = pageBuilds[i]!;
    const ctx = new PageContext(
      p.title,
      p.dateString,
      p.lastmodString,
      p.draft,
      "page",
      p.section,
      p.type,
      p.slug,
      p.relPermalink,
      "",
      placeholderHtml,
      placeholderHtml,
      placeholderHtml,
      p.description,
      p.tags,
      p.categories,
      p.Params,
      p.file,
      site.Language,
      emptyTranslations,
      undefined,
      site,
      emptyPages,
      undefined,
      emptyPages,
      p.layout,
    );
    pageContexts.add(ctx);
    pageRawBodies.add(ctx, p.rawBody);

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

  // Integrate frontmatter menus into site.Menus
  integrateFrontmatterMenus(pageBuilds, site);

  // Resolve pageRef for menu entries
  resolveMenuPageRefs(site);

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
  let homeRawBody = "";
  let homeDescription = "";
  let homeType = "home";
  let homeLayout: string | undefined = undefined;
  let homeParams = new Dictionary<string, ParamValue>();
  let homeFile: PageFile | undefined = undefined;
  let homeSourceDir: string | undefined = undefined;

  let homeIdxValue = new ListPageContent(undefined, "", "", undefined, undefined, homeParams, contentDir);
  const hasHomeIdx = listIndex.tryGetValue("", homeIdxValue);
  if (hasHomeIdx) {
    if (homeIdxValue.title !== undefined) homeTitle = homeIdxValue.title;
    homeRawBody = homeIdxValue.rawBody;
    homeDescription = homeIdxValue.description;
    homeType = homeIdxValue.type ?? "home";
    homeLayout = homeIdxValue.layout;
    homeParams = homeIdxValue.Params;
    homeFile = homeIdxValue.file;
    homeSourceDir = homeIdxValue.sourceDir;
  }

  const emptyHtmlString = new HtmlString("");
  const homeCtx = new PageContext(
    homeTitle,
    "",
    "",
    false,
    "home",
    "",
    homeType,
    "",
    "/",
    "",
    emptyHtmlString,
    emptyHtmlString,
    emptyHtmlString,
    homeDescription,
    emptyStrings,
    emptyStrings,
    homeParams,
    homeFile,
    site.Language,
    emptyTranslations,
    undefined,
    site,
    site.pages,
    undefined,
    emptyPages,
    homeLayout,
  );

  // Render home page content with shortcodes
  if (homeRawBody !== "") {
    const homeMd = renderMarkdownWithShortcodes(homeRawBody, homeCtx, site, env);
    homeCtx.content = new HtmlString(homeMd.html);
    homeCtx.summary = new HtmlString(homeMd.summaryHtml);
    homeCtx.tableOfContents = new HtmlString(homeMd.tableOfContents);
    homeCtx.plain = homeMd.plainText;
  }

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
    let sectionPages = new List<PageContext>();
    const ok = bySection.tryGetValue(section, sectionPages);
    if (ok) list = sectionPages.toArray();

    let title = humanizeSlug(section);
    let sectionRawBody = "";
    let description = "";
    let listType = section;
    let layout: string | undefined = undefined;
    let listParams = new Dictionary<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    let idxValue = new ListPageContent(undefined, "", "", undefined, undefined, listParams, contentDir);
    const hasIdx = listIndex.tryGetValue(section, idxValue);
    if (hasIdx) {
      if (idxValue.title !== undefined) title = idxValue.title;
      sectionRawBody = idxValue.rawBody;
      description = idxValue.description;
      listType = idxValue.type ?? section;
      layout = idxValue.layout;
      listParams = idxValue.Params;
      file = idxValue.file;
      listSourceDir = idxValue.sourceDir;
    }

    const ctx = new PageContext(
      title,
      "",
      "",
      false,
      "section",
      section,
      listType,
      section,
      combineUrl([section]),
      "",
      placeholderHtml,
      placeholderHtml,
      placeholderHtml,
      description,
      emptyStrings,
      emptyStrings,
      listParams,
      file,
      site.Language,
      emptyTranslations,
      undefined,
      site,
      list,
      undefined,
      emptyPages,
      layout,
    );

    // Render section content with shortcodes
    if (sectionRawBody !== "") {
      const md = renderMarkdownWithShortcodes(sectionRawBody, ctx, site, env);
      ctx.content = new HtmlString(md.html);
      ctx.summary = new HtmlString(md.summaryHtml);
      ctx.tableOfContents = new HtmlString(md.tableOfContents);
      ctx.plain = md.plainText;
    }

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
    let nestedRawBody = "";
    let description = "";
    let listType = section !== "" ? section : "section";
    let layout: string | undefined = undefined;
    let listParams = new Dictionary<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    let idxValue = new ListPageContent(undefined, "", "", undefined, undefined, listParams, contentDir);
    const hasIdx = listIndex.tryGetValue(dirKey, idxValue);
    if (hasIdx) {
      if (idxValue.title !== undefined) title = idxValue.title;
      nestedRawBody = idxValue.rawBody;
      description = idxValue.description;
      listType = idxValue.type ?? listType;
      layout = idxValue.layout;
      listParams = idxValue.Params;
      file = idxValue.file;
      listSourceDir = idxValue.sourceDir;
    }

    const ctx = new PageContext(
      title,
      "",
      "",
      false,
      "section",
      section,
      listType,
      leaf,
      urlPrefix,
      "",
      placeholderHtml,
      placeholderHtml,
      placeholderHtml,
      description,
      emptyStrings,
      emptyStrings,
      listParams,
      file,
      site.Language,
      emptyTranslations,
      undefined,
      site,
      listPages.toArray(),
      undefined,
      emptyPages,
      layout,
    );

    // Render nested section content with shortcodes
    if (nestedRawBody !== "") {
      const md = renderMarkdownWithShortcodes(nestedRawBody, ctx, site, env);
      ctx.content = new HtmlString(md.html);
      ctx.summary = new HtmlString(md.summaryHtml);
      ctx.tableOfContents = new HtmlString(md.tableOfContents);
      ctx.plain = md.plainText;
    }

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
      let pagesForTermList = new List<PageContext>();
      const ok = byTerm.tryGetValue(termSlug, pagesForTermList);
      if (!ok) continue;
      const pagesForTerm = pagesForTermList.toArray();

      const termParams = new Dictionary<string, ParamValue>();
      termParams.remove("term");
      termParams.add("term", ParamValue.string(termSlug));
      termParams.remove("taxonomy");
      termParams.add("taxonomy", ParamValue.string(taxonomy));

      const ctx = new PageContext(
        humanizeSlug(termSlug),
        "",
        "",
        false,
        "term",
        taxonomy,
        taxonomy,
        termSlug,
        combineUrl([taxonomy, termSlug]),
        "",
        new HtmlString(""),
        emptyHtml,
        emptyHtml,
        "",
        emptyStrings,
        emptyStrings,
        termParams,
        undefined,
        site.Language,
        emptyTranslations,
        undefined,
        site,
        pagesForTerm,
        undefined,
        emptyPages,
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

    const taxParams = new Dictionary<string, ParamValue>();
    taxParams.remove("taxonomy");
    taxParams.add("taxonomy", ParamValue.string(taxonomy));

    const taxCtx = new PageContext(
      humanizeSlug(taxonomy),
      "",
      "",
      false,
      "taxonomy",
      taxonomy,
      taxonomy,
      taxonomy,
      combineUrl([taxonomy]),
      "",
      new HtmlString(""),
      emptyHtml,
      emptyHtml,
      "",
      emptyStrings,
      emptyStrings,
      taxParams,
      undefined,
      site.Language,
      emptyTranslations,
      undefined,
      site,
      termPagesOut.toArray(),
      undefined,
      emptyPages,
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

    // Render content with shortcodes now that we have PageContext and SiteContext
    let rawBody = "";
    const hasRawBody = pageRawBodies.tryGetValue(ctx, rawBody);
    if (hasRawBody && rawBody !== "") {
      const md = renderMarkdownWithShortcodes(rawBody, ctx, site, env);
      ctx.content = new HtmlString(md.html);
      ctx.summary = new HtmlString(md.summaryHtml);
      ctx.tableOfContents = new HtmlString(md.tableOfContents);
      ctx.plain = md.plainText;
    }

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
