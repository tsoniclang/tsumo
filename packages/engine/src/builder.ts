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

const normalizeSlashes = (path: string): string => path.Replace("\\", "/");

const splitPath = (relativePath: string): string[] => normalizeSlashes(relativePath).Split("/");

const isBranchIndexFile = (name: string): boolean => name.ToLowerInvariant() === "_index.md";

const isLeafBundleIndexFile = (name: string): boolean => name.ToLowerInvariant() === "index.md";

const withoutMdExtension = (fileName: string): string => {
  const lower = fileName.ToLowerInvariant();
  return lower.EndsWith(".md") ? fileName.Substring(0, fileName.Length - 3) : fileName;
};

const buildPageFile = (dirKey: string, fileName: string, filePath: string): PageFile => {
  const slash: char = "/";
  const dir = dirKey === "" ? "" : dirKey.TrimEnd(slash) + "/";
  return new PageFile(Path.GetFullPath(filePath), dir, withoutMdExtension(fileName));
};

const joinUrlPath = (parts: string[]): string => {
  if (parts.Length === 0) return "";
  let out = parts[0]!;
  for (let i = 1; i < parts.Length; i++) out += "/" + parts[i]!;
  return out;
};

const containsSlash = (s: string): boolean => {
  const idx = s.IndexOf("/");
  return idx >= 0;
};

const combineOutputRelPath = (urlParts: string[]): string => {
  if (urlParts.Length === 0) return "index.html";
  let p = urlParts[0]!;
  for (let i = 1; i < urlParts.Length; i++) {
    p = Path.Combine(p, urlParts[i]!);
  }
  return Path.Combine(p, "index.html");
};

const isBundleDir = (dir: string): boolean => File.Exists(Path.Combine(dir, "index.md")) || File.Exists(Path.Combine(dir, "_index.md"));

const copyBundleResources = (srcDir: string, destDir: string): void => {
  if (!Directory.Exists(srcDir)) return;
  Directory.CreateDirectory(destDir);

  const files = Directory.GetFiles(srcDir, "*", SearchOption.TopDirectoryOnly);
  for (let i = 0; i < files.Length; i++) {
    const srcFile = files[i]!;
    if (srcFile.ToLowerInvariant().EndsWith(".md")) continue;
    const destFile = Path.Combine(destDir, Path.GetFileName(srcFile) ?? "");
    File.Copy(srcFile, destFile, true);
  }

  const dirs = Directory.GetDirectories(srcDir, "*", SearchOption.TopDirectoryOnly);
  for (let i = 0; i < dirs.Length; i++) {
    const child = dirs[i]!;
    if (isBundleDir(child)) continue;
    if (Directory.GetFiles(child, "*.md", SearchOption.TopDirectoryOnly).Length > 0) continue;
    const childName = Path.GetFileName(child);
    if (childName === undefined || childName === "") continue;
    copyBundleResources(child, Path.Combine(destDir, childName));
  }
};

// Find a page by its path reference
const findPageByRef = (pages: PageContext[], pageRef: string): PageContext | undefined => {
  const slash: char = "/";
  const normalizedRef = pageRef.Trim().TrimStart(slash).TrimEnd(slash).ToLowerInvariant();
  if (normalizedRef === "") return undefined;

  for (let i = 0; i < pages.Length; i++) {
    const page = pages[i]!;
    const normalizedPermalink = page.relPermalink.TrimStart(slash).TrimEnd(slash).ToLowerInvariant();
    if (normalizedPermalink === normalizedRef) return page;
  }

  // Also try matching by section/slug pattern
  for (let i = 0; i < pages.Length; i++) {
    const page = pages[i]!;
    // Check if pageRef matches the slug
    if (page.slug.ToLowerInvariant() === normalizedRef) return page;
    // Check section/slug pattern
    const sectionSlug = (page.section + "/" + page.slug).ToLowerInvariant();
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
  for (let i = 0; i < entry.children.Length; i++) {
    resolveMenuEntryPageRef(entry.children[i]!, pages);
  }
};

// Resolve pageRefs for all menu entries in a site
const resolveMenuPageRefs = (site: SiteContext): void => {
  const pages = site.pages;
  const menus = site.Menus;
  const menuKeys = menus.Keys.GetEnumerator();
  while (menuKeys.MoveNext()) {
    const menuName = menuKeys.Current;
    let entries: MenuEntry[] = [];
    const hasEntries = menus.TryGetValue(menuName, entries);
    if (hasEntries) {
      for (let i = 0; i < entries.Length; i++) {
        resolveMenuEntryPageRef(entries[i]!, pages);
      }
    }
  }
  menuKeys.Dispose();
};

// Menu helpers imported from menus.ts

const integrateFrontmatterMenus = (
  pageBuilds: ContentPageBuild[],
  site: SiteContext,
): void => {
  // Build a dictionary of pages keyed by lowercase filename for safe lookup
  const pagesByFilename = new Dictionary<string, PageContext>();
  const allPages = site.pages;
  for (let i = 0; i < allPages.Length; i++) {
    const page = allPages[i]!;
    if (page.File !== undefined) {
      const key = page.File.Filename.ToLowerInvariant();
      pagesByFilename.Remove(key);
      pagesByFilename.Add(key, page);
    }
  }

  // Collect all frontmatter menu entries per menu name
  const frontmatterEntriesPerMenu = new Dictionary<string, List<MenuEntry>>();

  for (let i = 0; i < pageBuilds.Length; i++) {
    const pageBuild = pageBuilds[i]!;
    if (pageBuild.menus.Length === 0) continue;

    // Look up the page context by filename
    const filenameKey = pageBuild.file.Filename.ToLowerInvariant();
    let pageContext: PageContext = allPages[0]!;
    const foundPage = pagesByFilename.TryGetValue(filenameKey, pageContext);
    if (!foundPage) continue;

    for (let j = 0; j < pageBuild.menus.Length; j++) {
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
      const hasEntries = frontmatterEntriesPerMenu.TryGetValue(menuName, entryList);
      if (!hasEntries) {
        entryList = new List<MenuEntry>();
        frontmatterEntriesPerMenu.Add(menuName, entryList);
      }
      entryList.Add(entry);
    }
  }

  // For each menu with frontmatter entries, merge with existing config entries and rebuild hierarchy
  const menuNamesList = new List<string>();
  const keysIt = frontmatterEntriesPerMenu.Keys.GetEnumerator();
  while (keysIt.MoveNext()) menuNamesList.Add(keysIt.Current);
  keysIt.Dispose();
  const menuNames = menuNamesList.ToArray();
  for (let i = 0; i < menuNames.Length; i++) {
    const menuName = menuNames[i]!;

    // Get existing menu entries (may already have hierarchy from config)
    let existingEntries: MenuEntry[] = [];
    const hasExisting = site.Menus.TryGetValue(menuName, existingEntries);

    // Flatten existing entries to break apart any hierarchy
    let flatExisting: MenuEntry[] = [];
    if (hasExisting) {
      flatExisting = flattenMenuEntries(existingEntries);
    }

    // Get frontmatter entries for this menu
    let fmEntryList: List<MenuEntry> = new List<MenuEntry>();
    frontmatterEntriesPerMenu.TryGetValue(menuName, fmEntryList);
    const fmEntries = fmEntryList.ToArray();

    // Combine all entries into a flat list
    const combined = new List<MenuEntry>();
    for (let j = 0; j < flatExisting.Length; j++) {
      const entry = flatExisting[j]!;
      combined.Add(entry);
    }
    for (let j = 0; j < fmEntries.Length; j++) {
      const entry = fmEntries[j]!;
      combined.Add(entry);
    }

    // Rebuild hierarchy from combined flat list (order-independent)
    const hierarchical = buildMenuHierarchy(combined.ToArray());

    // Update the site's menu
    site.Menus.Remove(menuName);
    site.Menus.Add(menuName, hierarchical);
  }
};

export const buildSite = (request: BuildRequest): BuildResult => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const docs = loadDocsConfig(siteDir);
  if (docs !== undefined) return buildDocsSite(request, docs);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  if (request.baseURL !== undefined && request.baseURL.Trim() !== "") {
    config.baseURL = ensureTrailingSlash(request.baseURL.Trim());
  }

  const outDir = Path.IsPathRooted(request.destinationDir)
    ? request.destinationDir
    : Path.Combine(siteDir, request.destinationDir);

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir, config.moduleMounts);

  if (request.cleanDestinationDir) {
    deleteDirRecursive(outDir);
  }
  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.Combine(themeDir, "static"), outDir);
  }
  const staticDir = Path.Combine(siteDir, "static");
  copyDirRecursive(staticDir, outDir);

  const contentDir = Path.Combine(siteDir, config.contentDir);
  const emptyFiles: string[] = [];
  const mdFiles: string[] = Directory.Exists(contentDir)
    ? Directory.GetFiles(contentDir, "*.md", SearchOption.AllDirectories)
    : emptyFiles;

  const pages = new List<ContentPageBuild>();
  const listIndex = new Dictionary<string, ListPageContent>();

  for (let i = 0; i < mdFiles.Length; i++) {
    const filePath = mdFiles[i]!;
    const rel = normalizeSlashes(Path.GetRelativePath(contentDir, filePath));
    const parts = splitPath(rel);
    const fileName = parts.Length > 0 ? parts[parts.Length - 1]! : rel;

    const dirPartsList = new List<string>();
    for (let j = 0; j < parts.Length - 1; j++) dirPartsList.Add(parts[j]!);
    const dirParts = dirPartsList.ToArray();
    const dirRel = joinUrlPath(dirParts);

    const parsed = parseContent(readTextFile(filePath));
    const fm = parsed.frontMatter;

    const dateUtc = fm.date ?? File.GetLastWriteTimeUtc(filePath);
    const dateString = dateUtc.ToString("O");
    const lastmodString = File.GetLastWriteTimeUtc(filePath).ToString("O");

    const pageParams = fm.Params;
    const file = buildPageFile(dirRel, fileName, filePath);

    if (isBranchIndexFile(fileName)) {
      const srcDir = Path.GetDirectoryName(filePath) ?? contentDir;
      listIndex.Remove(dirRel);
      listIndex.Add(dirRel, new ListPageContent(fm.title, parsed.body, fm.description ?? "", fm.type, fm.layout, pageParams, srcDir, file));
      continue;
    }

    const section = dirParts.Length > 0 ? dirParts[0]! : "";
    let pageType = fm.type;
    if (pageType === undefined || pageType.Trim() === "") {
      pageType = section !== "" ? section : "page";
    }

    const isLeafBundle = isLeafBundleIndexFile(fileName) && dirParts.Length > 0;
    const defaultLeafName = isLeafBundle ? dirParts[dirParts.Length - 1]! : withoutMdExtension(fileName);
    const title = fm.title ?? humanizeSlug(defaultLeafName);

    const slug = fm.slug ?? slugify(defaultLeafName);
    const urlPartsList = new List<string>();
    if (isLeafBundle === true) {
      for (let j = 0; j < dirParts.Length - 1; j++) urlPartsList.Add(dirParts[j]!);
      urlPartsList.Add(slug);
    } else {
      for (let j = 0; j < dirParts.Length; j++) urlPartsList.Add(dirParts[j]!);
      urlPartsList.Add(slug);
    }
    const urlParts = urlPartsList.ToArray();

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

    if (!page.draft || request.buildDrafts) pages.Add(page);
  }

  pages.Sort((a: ContentPageBuild, b: ContentPageBuild) => DateTime.Compare(b.dateUtc, a.dateUtc));

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];

  // Build language contexts for multilingual support
  const allLanguages = new List<LanguageContext>();
  if (config.languages.Length > 0) {
    for (let i = 0; i < config.languages.Length; i++) {
      const langConfig = config.languages[i]!;
      allLanguages.Add(new LanguageContext(langConfig.lang, langConfig.languageName, langConfig.languageDirection));
    }
  }

  // Create site with multilingual settings
  // For now, build the default (first) language; full multilingual build will iterate through all
  const currentLang = config.languages.Length > 0 ? config.languages[0] : undefined;
  const site = new SiteContext(config, emptyPages, currentLang, allLanguages.Count > 0 ? allLanguages.ToArray() : undefined);

  // Set up Sites array (for now, just this site; full implementation would have all language sites)
  const allSites: SiteContext[] = [site];
  site.Sites = allSites;

  const pageContexts = new List<PageContext>();
  const bySection = new Dictionary<string, List<PageContext>>();
  const pageRawBodies = new Dictionary<PageContext, string>();
  const placeholderHtml = new HtmlString("");

  const pageBuilds = pages.ToArray();
  for (let i = 0; i < pageBuilds.Length; i++) {
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
    pageContexts.Add(ctx);
    pageRawBodies.Add(ctx, p.rawBody);

    let sectionPages = new List<PageContext>();
    const hasSection = bySection.TryGetValue(p.section, sectionPages);
    if (!hasSection) {
      sectionPages = new List<PageContext>();
      bySection.Remove(p.section);
      bySection.Add(p.section, sectionPages);
    }
    sectionPages.Add(ctx);
  }

  const pageContextArr = pageContexts.ToArray();
  site.pages = pageContextArr;

  // Integrate frontmatter menus into site.Menus
  integrateFrontmatterMenus(pageBuilds, site);

  // Resolve pageRef for menu entries
  resolveMenuPageRefs(site);

  const baseCandidates = ["_default/baseof.html", "baseof.html"];

  const homeCandidates = ["index.html", "home.html", "_default/home.html", "_default/list.html", "list.html"];
  const listCandidates = ["list.html", "_default/list.html"];
  const singleCandidates = ["single.html", "_default/single.html"];

  const listTpl = selectTemplate(env, listCandidates) ?? listCandidates[0]!;
  const homeTpl = selectTemplate(env, homeCandidates) ?? listTpl;
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
  const hasHomeIdx = listIndex.TryGetValue("", homeIdxValue);
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
  writeTextFile(Path.Combine(outDir, "index.html"), homeHtml);
  pagesBuilt++;
  sitemapUrlSet.Remove("/");
  sitemapUrlSet.Add("/", true);
  if (homeSourceDir !== undefined) copyBundleResources(homeSourceDir, outDir);

  const sectionKeySet = new Dictionary<string, boolean>();
  const keysIt = bySection.Keys.GetEnumerator();
  while (keysIt.MoveNext()) {
    const k = keysIt.Current;
    if (k !== "") {
      sectionKeySet.Remove(k);
      sectionKeySet.Add(k, true);
    }
  }
  const listKeysIt = listIndex.Keys.GetEnumerator();
  while (listKeysIt.MoveNext()) {
    const listKey = listKeysIt.Current;
    const hasSlash = containsSlash(listKey);
    if (listKey === "" || hasSlash) continue;
    sectionKeySet.Remove(listKey);
    sectionKeySet.Add(listKey, true);
  }

  const sectionKeysList = new List<string>();
  const sectionKeysIt = sectionKeySet.Keys.GetEnumerator();
  while (sectionKeysIt.MoveNext()) sectionKeysList.Add(sectionKeysIt.Current);
  const sectionKeys = sectionKeysList.ToArray();

  for (let i = 0; i < sectionKeys.Length; i++) {
    const section = sectionKeys[i]!;

    let list: PageContext[] = emptyPages;
    let sectionPages = new List<PageContext>();
    const ok = bySection.TryGetValue(section, sectionPages);
    if (ok) list = sectionPages.ToArray();

    let title = humanizeSlug(section);
    let sectionRawBody = "";
    let description = "";
    let listType = section;
    let layout: string | undefined = undefined;
    let listParams = new Dictionary<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    let idxValue = new ListPageContent(undefined, "", "", undefined, undefined, listParams, contentDir);
    const hasIdx = listIndex.TryGetValue(section, idxValue);
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

    const relOut = Path.Combine(section, "index.html");
    const mainPath = selectTemplate(env, [`${listType}/list.html`, `${section}/list.html`, "_default/list.html"]) ?? listTpl;
    const basePath = selectTemplate(env, [`${listType}/baseof.html`, `${section}/baseof.html`, "_default/baseof.html"]) ?? baseTpl;
    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.Combine(outDir, relOut), html);
    pagesBuilt++;
    sitemapUrlSet.Remove(ctx.relPermalink);
    sitemapUrlSet.Add(ctx.relPermalink, true);
    if (listSourceDir !== undefined) copyBundleResources(listSourceDir, Path.Combine(outDir, section));
  }

  const listDirKeys = new List<string>();
  const nestedKeysIt = listIndex.Keys.GetEnumerator();
  while (nestedKeysIt.MoveNext()) {
    const dirKey = nestedKeysIt.Current;
    const hasSlash = containsSlash(dirKey);
    if (dirKey === "" || !hasSlash) continue;
    listDirKeys.Add(dirKey);
  }

  const nestedListDirs = listDirKeys.ToArray();
  for (let i = 0; i < nestedListDirs.Length; i++) {
    const dirKey = nestedListDirs[i]!;
    const urlPrefix = combineUrl(splitPath(dirKey));

    const listPages = new List<PageContext>();
    for (let j = 0; j < pageContextArr.Length; j++) {
      const p = pageContextArr[j]!;
      if (p.relPermalink.StartsWith(urlPrefix)) listPages.Add(p);
    }

    const dirParts = splitPath(dirKey);
    const leaf = dirParts.Length > 0 ? dirParts[dirParts.Length - 1]! : dirKey;
    const section = dirParts.Length > 0 ? dirParts[0]! : "";

    let title = humanizeSlug(leaf);
    let nestedRawBody = "";
    let description = "";
    let listType = section !== "" ? section : "section";
    let layout: string | undefined = undefined;
    let listParams = new Dictionary<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    let idxValue = new ListPageContent(undefined, "", "", undefined, undefined, listParams, contentDir);
    const hasIdx = listIndex.TryGetValue(dirKey, idxValue);
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
      listPages.ToArray(),
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
    writeTextFile(Path.Combine(outDir, outRel), html);
    pagesBuilt++;
    sitemapUrlSet.Remove(ctx.relPermalink);
    sitemapUrlSet.Add(ctx.relPermalink, true);

    if (listSourceDir !== undefined) {
      const slash: char = "/";
      const destDir = Path.Combine(outDir, dirKey.Replace(slash, Path.DirectorySeparatorChar));
      copyBundleResources(listSourceDir, destDir);
    }
  }

  const buildTaxonomy = (taxonomy: string, getTerms: (page: PageContext) => string[]): void => {
    const byTerm = new Dictionary<string, List<PageContext>>();

    for (let i = 0; i < pageContextArr.Length; i++) {
      const page = pageContextArr[i]!;
      const terms = getTerms(page);
      for (let j = 0; j < terms.Length; j++) {
        const raw = terms[j]!;
        const termText = raw.Trim();
        if (termText === "") continue;
        const termSlug = slugify(termText);
        if (termSlug === "") continue;

        let termPages = new List<PageContext>();
        const hasTerm = byTerm.TryGetValue(termSlug, termPages);
        if (!hasTerm) {
          termPages = new List<PageContext>();
          byTerm.Remove(termSlug);
          byTerm.Add(termSlug, termPages);
        }
        termPages.Add(page);
      }
    }

    const termKeys = new List<string>();
    const keysIt = byTerm.Keys.GetEnumerator();
    while (keysIt.MoveNext()) termKeys.Add(keysIt.Current);
    termKeys.Sort();

    const emptyHtml = new HtmlString("");
    const termPagesOut = new List<PageContext>();

    const termSlugs = termKeys.ToArray();
    for (let i = 0; i < termSlugs.Length; i++) {
      const termSlug = termSlugs[i]!;
      let pagesForTermList = new List<PageContext>();
      const ok = byTerm.TryGetValue(termSlug, pagesForTermList);
      if (!ok) continue;
      const pagesForTerm = pagesForTermList.ToArray();

      const termParams = new Dictionary<string, ParamValue>();
      termParams.Remove("term");
      termParams.Add("term", ParamValue.string(termSlug));
      termParams.Remove("taxonomy");
      termParams.Add("taxonomy", ParamValue.string(taxonomy));

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

      termPagesOut.Add(ctx);

      const outRel = Path.Combine(taxonomy, termSlug, "index.html");
      const mainPath =
        selectTemplate(env, [`${taxonomy}/taxonomy.html`, "taxonomy/taxonomy.html", "_default/taxonomy.html", "_default/list.html"]) ?? listTpl;
      const basePath =
        selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
      const html = renderWithBase(env, basePath, mainPath, ctx);
      writeTextFile(Path.Combine(outDir, outRel), html);
      pagesBuilt++;
      sitemapUrlSet.Remove(ctx.relPermalink);
      sitemapUrlSet.Add(ctx.relPermalink, true);
    }

    const taxParams = new Dictionary<string, ParamValue>();
    taxParams.Remove("taxonomy");
    taxParams.Add("taxonomy", ParamValue.string(taxonomy));

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
      termPagesOut.ToArray(),
      undefined,
      emptyPages,
    );

    const taxOutRel = Path.Combine(taxonomy, "index.html");
    const taxMainPath =
      selectTemplate(env, [`${taxonomy}/terms.html`, "taxonomy/terms.html", "_default/terms.html", "_default/list.html"]) ?? listTpl;
    const taxBasePath =
      selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
    const taxHtml = renderWithBase(env, taxBasePath, taxMainPath, taxCtx);
    writeTextFile(Path.Combine(outDir, taxOutRel), taxHtml);
    pagesBuilt++;
    sitemapUrlSet.Remove(taxCtx.relPermalink);
    sitemapUrlSet.Add(taxCtx.relPermalink, true);
  };

  buildTaxonomy("tags", (page: PageContext) => page.tags);
  buildTaxonomy("categories", (page: PageContext) => page.categories);

  const singles = pageBuilds;
  for (let i = 0; i < singles.Length; i++) {
    const p = singles[i]!;

    const ctx = pageContextArr[i]!;

    // Render content with shortcodes now that we have PageContext and SiteContext
    let rawBody = "";
    const hasRawBody = pageRawBodies.TryGetValue(ctx, rawBody);
    if (hasRawBody && rawBody !== "") {
      const md = renderMarkdownWithShortcodes(rawBody, ctx, site, env);
      ctx.content = new HtmlString(md.html);
      ctx.summary = new HtmlString(md.summaryHtml);
      ctx.tableOfContents = new HtmlString(md.tableOfContents);
      ctx.plain = md.plainText;
    }

    const templateType = p.type !== "" ? p.type : p.section;
    const layoutCandidates = p.layout !== undefined && p.layout.Trim() !== ""
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
      templateType !== ""
        ? [`${templateType}/baseof.html`, `${p.section}/baseof.html`, "_default/baseof.html", "baseof.html"]
        : ["_default/baseof.html", "baseof.html"],
    ) ?? baseTpl;

    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.Combine(outDir, p.outputRelPath), html);
    pagesBuilt++;
    sitemapUrlSet.Remove(ctx.relPermalink);
    sitemapUrlSet.Add(ctx.relPermalink, true);

    if (isLeafBundleIndexFile(Path.GetFileName(p.sourcePath) ?? "") && Path.GetDirectoryName(p.sourcePath) !== undefined) {
      const destDir = Path.GetDirectoryName(Path.Combine(outDir, p.outputRelPath));
      if (destDir !== undefined && destDir !== "") {
        copyBundleResources(Path.GetDirectoryName(p.sourcePath)!, destDir);
      }
    }
  }

  const rels = new List<string>();
  const relIt = sitemapUrlSet.Keys.GetEnumerator();
  while (relIt.MoveNext()) rels.Add(relIt.Current);
  const relArr = rels.ToArray();

  const sitemapPath = Path.Combine(outDir, "sitemap.xml");
  if (!File.Exists(sitemapPath)) {
    writeTextFile(sitemapPath, renderSitemap(config, relArr));
    pagesBuilt++;
  }

  const rssPath = Path.Combine(outDir, "index.xml");
  if (!File.Exists(rssPath)) {
    writeTextFile(rssPath, renderRss(config, site.pages));
    pagesBuilt++;
  }

  const robotsPath = Path.Combine(outDir, "robots.txt");
  if (!File.Exists(robotsPath)) {
    writeTextFile(robotsPath, renderRobotsTxt(config));
    pagesBuilt++;
  }

  return new BuildResult(outDir, pagesBuilt);
};
