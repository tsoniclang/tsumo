import { File, Path } from "@tsonic/dotnet/System.IO.js";
import type { int } from "@tsonic/csharp/types.js";
import { BuildRequest, BuildResult, LanguageContext, PageContext, PageFile, SiteContext } from "./models.js";
import { ParamValue } from "./params.js";
import { renderRobotsTxt, renderRss, renderSitemap } from "./outputs.js";
import { loadSiteConfig } from "./config.js";
import { loadDocsConfig } from "./docs/config.js";
import { copyDirRecursive, ensureDir, writeTextFile } from "./fs.js";
import { BuildEnvironment } from "./env.js";
import { renderMarkdownWithShortcodes } from "./markdown.js";
import { HtmlString } from "./utils/html.js";
import { ensureTrailingSlash, humanizeSlug, slugify } from "./utils/text.js";
import { combineUrl, renderWithBase, resolveThemeDir, selectTemplate } from "./build/layout.js";
import { buildDocsSite } from "./docs/builder.js";
import { replaceText } from "./utils/strings.js";
import { beginOutputPublication } from "./output-publication.js";
import { copyBundleResources } from "./build/bundle-resources.js";
import { ContentPageSource } from "./build/content-model.js";
import { discoverContent } from "./build/discover-content.js";
import { configureSiteMenus } from "./build/menu-resolution.js";
import { siteOutputPath, sitePathIsNested, splitSitePath } from "./build/site-routes.js";

const buildStandardSite = (request: BuildRequest, siteDir: string, outDir: string): int => {
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  const requestBaseURL = request.baseURL;
  if (requestBaseURL !== undefined && requestBaseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(requestBaseURL.trim());
  }

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir, config.moduleMounts);

  ensureDir(outDir);

  if (themeDir !== undefined) {
    copyDirRecursive(Path.Combine(themeDir, "static"), outDir);
  }
  const staticDir = Path.Combine(siteDir, "static");
  copyDirRecursive(staticDir, outDir);

  const contentDir = Path.Combine(siteDir, config.contentDir);
  const content = discoverContent(contentDir, request.buildDrafts);
  const pages = content.pages;
  const listIndex = content.listPagesByRoute;

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];

  // Build language contexts for multilingual support
  const allLanguages: LanguageContext[] = [];
  if (config.languages.length > 0) {
    for (let i = 0; i < config.languages.length; i++) {
      const langConfig = config.languages[i]!;
      allLanguages.push(new LanguageContext(langConfig.lang, langConfig.languageName, langConfig.languageDirection));
    }
  }

  // The selected first language is the one language materialized by this build.
  const currentLang = config.languages.length > 0 ? config.languages[0] : undefined;
  const site = new SiteContext(config, emptyPages, currentLang, allLanguages.length > 0 ? allLanguages : undefined);

  // A single-language build exposes exactly one site context.
  const allSites: SiteContext[] = [site];
  site.Sites = allSites;

  const pageContexts: PageContext[] = [];
  const bySection = new Map<string, PageContext[]>();
  const pageRawBodies = new Map<PageContext, string>();
  const placeholderHtml = new HtmlString("");

  const pageBuilds = pages;
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
      p.parameters,
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
    pageContexts.push(ctx);
    pageRawBodies.set(ctx, p.rawBody);

    let sectionPages = bySection.get(p.section);
    if (sectionPages === undefined) {
      sectionPages = [];
      bySection.set(p.section, sectionPages);
    }
    sectionPages.push(ctx);
  }

  const pageContextArr = pageContexts;
  site.pages = pageContextArr;

  configureSiteMenus(pageBuilds, pageContextArr, site);

  const baseCandidates = ["_default/baseof.html", "baseof.html"];

  const homeCandidates = ["index.html", "home.html", "_default/home.html", "_default/list.html", "list.html"];
  const listCandidates = ["list.html", "_default/list.html"];
  const singleCandidates = ["single.html", "_default/single.html"];

  const listTpl = selectTemplate(env, listCandidates) ?? listCandidates[0]!;
  const homeTpl = selectTemplate(env, homeCandidates) ?? listTpl;
  const singleTpl = selectTemplate(env, singleCandidates) ?? singleCandidates[0]!;
  const baseTpl = selectTemplate(env, baseCandidates);

  let pagesBuilt = 0;
  const sitemapUrlSet = new Map<string, boolean>();

  let homeTitle = config.title;
  let homeRawBody = "";
  let homeDescription = "";
  let homeType = "home";
  let homeLayout: string | undefined = undefined;
  let homeParams = new Map<string, ParamValue>();
  let homeFile: PageFile | undefined = undefined;
  let homeSourceDir: string | undefined = undefined;

  const homeIdxValue = listIndex.get("");
  if (homeIdxValue !== undefined) {
    const homeIdxTitle = homeIdxValue.title;
    if (homeIdxTitle !== undefined) homeTitle = homeIdxTitle;
    homeRawBody = homeIdxValue.rawBody;
    homeDescription = homeIdxValue.description;
    homeType = homeIdxValue.type ?? "home";
    homeLayout = homeIdxValue.layout;
    homeParams = homeIdxValue.parameters;
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
  sitemapUrlSet.set("/", true);
  if (homeSourceDir !== undefined) copyBundleResources(homeSourceDir, outDir);

  const sectionKeySet = new Map<string, boolean>();
  for (const k of bySection.keys()) {
    if (k !== "") {
      sectionKeySet.set(k, true);
    }
  }
  for (const listKey of listIndex.keys()) {
    const hasSlash = sitePathIsNested(listKey);
    if (listKey === "" || hasSlash) continue;
    sectionKeySet.set(listKey, true);
  }

  const sectionKeys: string[] = [];
  for (const sectionKey of sectionKeySet.keys()) sectionKeys.push(sectionKey);

  for (let i = 0; i < sectionKeys.length; i++) {
    const section = sectionKeys[i]!;

    let list: PageContext[] = emptyPages;
    const sectionPages = bySection.get(section);
    if (sectionPages !== undefined) list = sectionPages;

    let title = humanizeSlug(section);
    let sectionRawBody = "";
    let description = "";
    let listType = section;
    let layout: string | undefined = undefined;
  let listParams = new Map<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    const idxValue = listIndex.get(section);
    if (idxValue !== undefined) {
      const idxTitle = idxValue.title;
      if (idxTitle !== undefined) title = idxTitle;
      sectionRawBody = idxValue.rawBody;
      description = idxValue.description;
      listType = idxValue.type ?? section;
      layout = idxValue.layout;
      listParams = idxValue.parameters;
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
    sitemapUrlSet.set(ctx.relPermalink, true);
    if (listSourceDir !== undefined) copyBundleResources(listSourceDir, Path.Combine(outDir, section));
  }

  const nestedListDirs: string[] = [];
  for (const nestedDirKey of listIndex.keys()) {
    const hasSlash = sitePathIsNested(nestedDirKey);
    if (nestedDirKey === "" || !hasSlash) continue;
    nestedListDirs.push(nestedDirKey);
  }
  for (let i = 0; i < nestedListDirs.length; i++) {
    const dirKey = nestedListDirs[i]!;
    const urlPrefix = combineUrl(splitSitePath(dirKey));

    const listPages: PageContext[] = [];
    for (let j = 0; j < pageContextArr.length; j++) {
      const p = pageContextArr[j]!;
      if (p.relPermalink.startsWith(urlPrefix)) listPages.push(p);
    }

    const dirParts = splitSitePath(dirKey);
    const leaf = dirParts.length > 0 ? dirParts[dirParts.length - 1]! : dirKey;
    const section = dirParts.length > 0 ? dirParts[0]! : "";

    let title = humanizeSlug(leaf);
    let nestedRawBody = "";
    let description = "";
    let listType = section !== "" ? section : "section";
    let layout: string | undefined = undefined;
    let listParams = new Map<string, ParamValue>();
    let file: PageFile | undefined = undefined;
    let listSourceDir: string | undefined = undefined;

    const idxValue = listIndex.get(dirKey);
    if (idxValue !== undefined) {
      const idxTitle = idxValue.title;
      if (idxTitle !== undefined) title = idxTitle;
      nestedRawBody = idxValue.rawBody;
      description = idxValue.description;
      listType = idxValue.type ?? listType;
      layout = idxValue.layout;
      listParams = idxValue.parameters;
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
      listPages,
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

    const outRel = siteOutputPath(dirParts);
    const mainPath = selectTemplate(env, [`${listType}/list.html`, `${section}/list.html`, "_default/list.html"]) ?? listTpl;
    const basePath = selectTemplate(env, [`${listType}/baseof.html`, `${section}/baseof.html`, "_default/baseof.html"]) ?? baseTpl;
    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.Combine(outDir, outRel), html);
    pagesBuilt++;
    sitemapUrlSet.set(ctx.relPermalink, true);

    if (listSourceDir !== undefined) {
      const slash = "/";
      const destDir = Path.Combine(
        outDir,
        replaceText(dirKey, slash, `${Path.DirectorySeparatorChar}`)
      );
      copyBundleResources(listSourceDir, destDir);
    }
  }

  const buildTaxonomy = (taxonomy: string, getTerms: (page: PageContext) => string[]): void => {
    const byTerm = new Map<string, PageContext[]>();

    for (let i = 0; i < pageContextArr.length; i++) {
      const page = pageContextArr[i]!;
      const terms = getTerms(page);
      for (let j = 0; j < terms.length; j++) {
        const raw = terms[j]!;
        const termText = raw.trim();
        if (termText === "") continue;
        const termSlug = slugify(termText);
        if (termSlug === "") continue;

        let termPages = byTerm.get(termSlug);
        if (termPages === undefined) {
          termPages = [];
          byTerm.set(termSlug, termPages);
        }
        termPages.push(page);
      }
    }

    const termKeys: string[] = [];
    for (const termKey of byTerm.keys()) termKeys.push(termKey);
    termKeys.sort();

    const emptyHtml = new HtmlString("");
    const termPagesOut: PageContext[] = [];

    const termSlugs = termKeys;
    for (let i = 0; i < termSlugs.length; i++) {
      const termSlug = termSlugs[i]!;
      const pagesForTerm = byTerm.get(termSlug);
      if (pagesForTerm === undefined) continue;

      const termParams = new Map<string, ParamValue>();
      termParams.set("term", ParamValue.string(termSlug));
      termParams.set("taxonomy", ParamValue.string(taxonomy));

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
        undefined,
      );

      termPagesOut.push(ctx);

      const outRel = Path.Combine(taxonomy, termSlug, "index.html");
      const mainPath =
        selectTemplate(env, [`${taxonomy}/taxonomy.html`, "taxonomy/taxonomy.html", "_default/taxonomy.html", "_default/list.html"]) ?? listTpl;
      const basePath =
        selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
      const html = renderWithBase(env, basePath, mainPath, ctx);
      writeTextFile(Path.Combine(outDir, outRel), html);
      pagesBuilt++;
      sitemapUrlSet.set(ctx.relPermalink, true);
    }

    const taxParams = new Map<string, ParamValue>();
    taxParams.set("taxonomy", ParamValue.string(taxonomy));

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
      termPagesOut,
      undefined,
      emptyPages,
      undefined,
    );

    const taxOutRel = Path.Combine(taxonomy, "index.html");
    const taxMainPath =
      selectTemplate(env, [`${taxonomy}/terms.html`, "taxonomy/terms.html", "_default/terms.html", "_default/list.html"]) ?? listTpl;
    const taxBasePath =
      selectTemplate(env, [`${taxonomy}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"]) ?? baseTpl;
    const taxHtml = renderWithBase(env, taxBasePath, taxMainPath, taxCtx);
    writeTextFile(Path.Combine(outDir, taxOutRel), taxHtml);
    pagesBuilt++;
    sitemapUrlSet.set(taxCtx.relPermalink, true);
  };

  buildTaxonomy("tags", (page: PageContext) => page.tags);
  buildTaxonomy("categories", (page: PageContext) => page.categories);

  const singles = pageBuilds;
  for (let i = 0; i < singles.length; i++) {
    const p = singles[i]!;

    const ctx = pageContextArr[i]!;

    // Render content with shortcodes now that we have PageContext and SiteContext
    const rawBody = pageRawBodies.get(ctx);
    if (rawBody !== undefined && rawBody !== "") {
      const md = renderMarkdownWithShortcodes(rawBody, ctx, site, env);
      ctx.content = new HtmlString(md.html);
      ctx.summary = new HtmlString(md.summaryHtml);
      ctx.tableOfContents = new HtmlString(md.tableOfContents);
      ctx.plain = md.plainText;
    }

    const templateType = p.type !== "" ? p.type : p.section;
    const pLayout = p.layout;
    const layoutCandidates = pLayout !== undefined && pLayout.trim() !== ""
      ? [
          `${templateType}/${pLayout}.html`,
          `${p.section}/${pLayout}.html`,
          `_default/${pLayout}.html`,
          `${pLayout}.html`,
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
    sitemapUrlSet.set(ctx.relPermalink, true);

    const sourceDir = Path.GetDirectoryName(p.sourcePath);
    if (p.leafBundle && sourceDir !== undefined && sourceDir !== "") {
      const destDir = Path.GetDirectoryName(Path.Combine(outDir, p.outputRelPath));
      if (destDir !== undefined && destDir !== "") {
        copyBundleResources(sourceDir, destDir);
      }
    }
  }

  const relArr: string[] = [];
  for (const relKey of sitemapUrlSet.keys()) relArr.push(relKey);

  const sitemapPath = Path.Combine(outDir, "sitemap.xml");
  if (!File.Exists(sitemapPath)) {
    writeTextFile(sitemapPath, renderSitemap(config, relArr, request.buildTime));
    pagesBuilt++;
  }

  const rssPath = Path.Combine(outDir, "index.xml");
  if (!File.Exists(rssPath)) {
    writeTextFile(rssPath, renderRss(config, site.pages, request.buildTime));
    pagesBuilt++;
  }

  const robotsPath = Path.Combine(outDir, "robots.txt");
  if (!File.Exists(robotsPath)) {
    writeTextFile(robotsPath, renderRobotsTxt(config));
    pagesBuilt++;
  }

  return pagesBuilt;
};

export const buildSite = (request: BuildRequest): BuildResult => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const docs = loadDocsConfig(siteDir);
  const publication = beginOutputPublication(
    siteDir,
    request.destinationDir,
    !request.cleanDestinationDir,
  );
  const pagesBuilt = docs === undefined
    ? buildStandardSite(request, siteDir, publication.stagingDir)
    : buildDocsSite(request, docs, publication.stagingDir);
  publication.publish();
  return new BuildResult(publication.destinationDir, pagesBuilt);
};
