import { Char, DateTime } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import type { char } from "@tsonic/core/types.js";
import { BuildRequest, BuildResult, PageContext, SiteContext, SiteConfig } from "./models.ts";
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
  readonly slug: string;
  readonly title: string;
  readonly dateUtc: DateTime;
  readonly dateString: string;
  readonly draft: boolean;
  readonly tags: string[];
  readonly categories: string[];
  readonly Params: Dictionary<string, string>;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly relPermalink: string;
  readonly outputRelPath: string;
  readonly layout: string | undefined;

  constructor(args: {
    sourcePath: string;
    section: string;
    slug: string;
    title: string;
    dateUtc: DateTime;
    dateString: string;
    draft: boolean;
    tags: string[];
    categories: string[];
    Params: Dictionary<string, string>;
    content: HtmlString;
    summary: HtmlString;
    relPermalink: string;
    outputRelPath: string;
    layout: string | undefined;
  }) {
    this.sourcePath = args.sourcePath;
    this.section = args.section;
    this.slug = args.slug;
    this.title = args.title;
    this.dateUtc = args.dateUtc;
    this.dateString = args.dateString;
    this.draft = args.draft;
    this.tags = args.tags;
    this.categories = args.categories;
    this.Params = args.Params;
    this.content = args.content;
    this.summary = args.summary;
    this.relPermalink = args.relPermalink;
    this.outputRelPath = args.outputRelPath;
    this.layout = args.layout;
  }
}

class ListPageContent {
  readonly title: string | undefined;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly Params: Dictionary<string, string>;

  constructor(title: string | undefined, content: HtmlString, summary: HtmlString, parameters: Dictionary<string, string>) {
    this.title = title;
    this.content = content;
    this.summary = summary;
    this.Params = parameters;
  }
}

const normalizeSlashes = (path: string): string => path.replace("\\", "/");

const splitPath = (relativePath: string): string[] => normalizeSlashes(relativePath).split("/");

const isIndexFile = (name: string): boolean => name.toLowerInvariant() === "_index.md";

const withoutMdExtension = (fileName: string): string => {
  const lower = fileName.toLowerInvariant();
  return lower.endsWith(".md") ? fileName.substring(0, fileName.length - 3) : fileName;
};

const combineUrl = (parts: string[]): string => {
  const slash: char = Char.parse("/");
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
  const sectionIndex = new Dictionary<string, ListPageContent>();
  let homeIndex: ListPageContent | undefined = undefined;

  for (let i = 0; i < mdFiles.length; i++) {
    const filePath = mdFiles[i]!;
    const rel = normalizeSlashes(Path.getRelativePath(contentDir, filePath));
    const parts = splitPath(rel);
    const fileName = parts.length > 0 ? parts[parts.length - 1]! : rel;

    const parsed = parseContent(readTextFile(filePath));
    const md = renderMarkdown(parsed.body);
    const fm = parsed.frontMatter;

    const title = fm.title ?? humanizeSlug(withoutMdExtension(fileName));
    const dateUtc = fm.date ?? File.getLastWriteTimeUtc(filePath);
    const dateString = dateUtc.toString("O");

    const content = new HtmlString(md.html);
    const summary = new HtmlString(md.summaryHtml);

    const pageParams = fm.Params;

    if (isIndexFile(fileName)) {
      if (parts.length === 1) {
        homeIndex = new ListPageContent(fm.title, content, summary, pageParams);
      } else {
        const indexSection = parts[0]!;
        sectionIndex.remove(indexSection);
        sectionIndex.add(indexSection, new ListPageContent(fm.title, content, summary, pageParams));
      }
      continue;
    }

    const section = parts.length > 1 ? parts[0]! : "";
    const slug = fm.slug ?? slugify(withoutMdExtension(fileName));

    const relPermalink = combineUrl(section !== "" ? [section, slug] : [slug]);
    const outputRelPath =
      section !== ""
        ? Path.combine(section, slug, "index.html")
        : Path.combine(slug, "index.html");

    const page = new ContentPageBuild({
      sourcePath: filePath,
      section,
      slug,
      title,
      dateUtc,
      dateString,
      draft: fm.draft,
      tags: fm.tags,
      categories: fm.categories,
      Params: pageParams,
      content,
      summary,
      relPermalink,
      outputRelPath,
      layout: fm.layout,
    });

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
	      p.section,
	      p.slug,
	      p.relPermalink,
	      p.content,
	      p.summary,
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

  let homeTitle = config.title;
  let homeContent = new HtmlString("");
  let homeSummary = new HtmlString("");
  let homeParams = new Dictionary<string, string>();
	  if (homeIndex !== undefined) {
	    if (homeIndex.title !== undefined) homeTitle = homeIndex.title;
	    homeContent = homeIndex.content;
	    homeSummary = homeIndex.summary;
	    homeParams = homeIndex.Params;
	  }

	  const homeCtx = new PageContext(
	    homeTitle,
	    "",
	    false,
	    "",
	    "",
	    "/",
	    homeContent,
	    homeSummary,
	    emptyStrings,
	    emptyStrings,
	    homeParams,
	    site,
	    site.pages,
	  );

  const homeHtml = renderWithBase(env, baseTpl, homeTpl, homeCtx);
  writeTextFile(Path.combine(outDir, "index.html"), homeHtml);

  const sectionKeysList = new List<string>();
  const keysIt = bySection.keys.getEnumerator();
  while (keysIt.moveNext()) sectionKeysList.add(keysIt.current);
  const sectionKeys = sectionKeysList.toArray();
  for (let i = 0; i < sectionKeys.length; i++) {
    const section = sectionKeys[i]!;
    if (section === "") continue;

    const sectionPages = new List<PageContext>();
    const ok = bySection.tryGetValue(section, sectionPages);
    if (!ok) continue;
    const list = sectionPages.toArray();

	    let title = humanizeSlug(section);
	    let content = new HtmlString("");
	    let summary = new HtmlString("");
	    let listParams = new Dictionary<string, string>();

	    const idxValue = new ListPageContent(undefined, content, summary, listParams);
	    const hasIdx = sectionIndex.tryGetValue(section, idxValue);
	    if (hasIdx) {
	      if (idxValue.title !== undefined) title = idxValue.title;
	      content = idxValue.content;
	      summary = idxValue.summary;
	      listParams = idxValue.Params;
	    }

	    const ctx = new PageContext(
	      title,
	      "",
	      false,
	      section,
	      "",
	      combineUrl([section]),
	      content,
	      summary,
	      emptyStrings,
	      emptyStrings,
	      listParams,
	      site,
	      list,
	    );

    const relOut = Path.combine(section, "index.html");
    const mainPath = selectTemplate(env, [`${section}/list.html`, "_default/list.html"]) ?? listTpl;
    const basePath = selectTemplate(env, [`${section}/baseof.html`, "_default/baseof.html"]) ?? baseTpl;
    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.combine(outDir, relOut), html);
  }

	  const singles = pageBuilds;
	  for (let i = 0; i < singles.length; i++) {
	    const p = singles[i]!;

	    const ctx = pageContextArr[i]!;

    const layoutCandidates = p.layout !== undefined && p.layout.trim() !== ""
      ? [
          `${p.section}/${p.layout}.html`,
          `_default/${p.layout}.html`,
          `${p.layout}.html`,
          `${p.section}/single.html`,
          "_default/single.html",
        ]
      : [p.section !== "" ? `${p.section}/single.html` : "_default/single.html", "_default/single.html"];

    const mainPath = selectTemplate(env, layoutCandidates) ?? singleTpl;
    const basePath = selectTemplate(env, p.section !== "" ? [`${p.section}/baseof.html`, "_default/baseof.html"] : ["_default/baseof.html"]);

    const html = renderWithBase(env, basePath, mainPath, ctx);
    writeTextFile(Path.combine(outDir, p.outputRelPath), html);
  }

  return new BuildResult(outDir, pageContexts.count);
};
