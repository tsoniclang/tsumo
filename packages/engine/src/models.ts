import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { HtmlString } from "./utils/html.ts";
import type { DocsMountContext } from "./docs/models.ts";
import { ParamValue } from "./params.ts";

export class MenuEntry {
  readonly name: string;
  readonly url: string;
  readonly pageRef: string;
  readonly title: string;
  readonly weight: int;
  readonly parent: string;
  readonly identifier: string;
  readonly pre: string;
  readonly post: string;
  readonly menu: string;
  readonly Params: Dictionary<string, ParamValue>;
  page: PageContext | undefined;
  children: MenuEntry[];

  constructor(
    name: string,
    url: string,
    pageRef: string,
    title: string,
    weight: int,
    parent: string,
    identifier: string,
    pre: string,
    post: string,
    menu: string,
    params?: Dictionary<string, ParamValue>,
  ) {
    this.name = name;
    this.url = url;
    this.pageRef = pageRef;
    this.title = title;
    this.weight = weight;
    this.parent = parent;
    this.identifier = identifier;
    this.pre = pre;
    this.post = post;
    this.menu = menu;
    this.Params = params ?? new Dictionary<string, ParamValue>();
    this.page = undefined;
    const empty: MenuEntry[] = [];
    this.children = empty;
  }
}

export class MediaType {
  readonly Type: string;

  constructor(type: string) {
    this.Type = type;
  }
}

export class OutputFormat {
  readonly Rel: string;
  readonly MediaType: MediaType;
  readonly Permalink: string;

  constructor(rel: string, mediaType: string, permalink: string) {
    this.Rel = rel;
    this.MediaType = new MediaType(mediaType);
    this.Permalink = permalink;
  }
}

export class LanguageConfig {
  readonly lang: string;
  readonly languageName: string;
  readonly languageDirection: string;
  readonly contentDir: string;
  readonly weight: int;

  constructor(lang: string, languageName: string, languageDirection: string, contentDir: string, weight: int) {
    this.lang = lang;
    this.languageName = languageName;
    this.languageDirection = languageDirection;
    this.contentDir = contentDir;
    this.weight = weight;
  }
}

export class LanguageContext {
  readonly Lang: string;
  readonly LanguageName: string;
  readonly LanguageDirection: string;

  constructor(lang: string, languageName: string, languageDirection: string) {
    this.Lang = lang;
    this.LanguageName = languageName;
    this.LanguageDirection = languageDirection;
  }
}

export class PageFile {
  readonly Filename: string;
  readonly Dir: string;
  readonly BaseFileName: string;

  constructor(filename: string, dir: string, baseFileName: string) {
    this.Filename = filename;
    this.Dir = dir;
    this.BaseFileName = baseFileName;
  }
}

export class SiteConfig {
  title: string;
  baseURL: string;
  languageCode: string;
  contentDir: string;
  languages: LanguageConfig[];
  theme: string | undefined;
  copyright: string | undefined;
  Params: Dictionary<string, ParamValue>;
  Menus: Dictionary<string, MenuEntry[]>;

  constructor(title: string, baseURL: string, languageCode: string, theme: string | undefined, copyright?: string) {
    this.title = title;
    this.baseURL = baseURL;
    this.languageCode = languageCode;
    this.contentDir = "content";
    const empty: LanguageConfig[] = [];
    this.languages = empty;
    this.theme = theme;
    this.copyright = copyright;
    this.Params = new Dictionary<string, ParamValue>();
    this.Menus = new Dictionary<string, MenuEntry[]>();
  }
}

export class SiteContext {
  readonly title: string;
  readonly baseURL: string;
  readonly languageCode: string;
  readonly copyright: string;
  readonly Language: LanguageContext;
  readonly Languages: LanguageContext[];
  readonly IsMultiLingual: boolean;
  readonly LanguagePrefix: string;
  readonly Params: Dictionary<string, ParamValue>;
  readonly Menus: Dictionary<string, MenuEntry[]>;
  readonly Taxonomies: Dictionary<string, Dictionary<string, PageContext[]>>;
  readonly store: object | undefined;
  pages: PageContext[];
  allPages: PageContext[];
  home: PageContext | undefined;
  docsMounts: DocsMountContext[];
  Sites: SiteContext[];

  constructor(config: SiteConfig, pages: PageContext[], language?: LanguageConfig, allLanguages?: LanguageContext[]) {
    this.title = config.title;
    this.baseURL = config.baseURL;
    this.copyright = config.copyright ?? "";

    // Set language from explicit parameter or config
    // Note: languageCode must always match Language.Lang for consistency
    if (language !== undefined) {
      this.Language = new LanguageContext(language.lang, language.languageName, language.languageDirection);
      this.languageCode = language.lang;
    } else {
      const lang = config.languages.length > 0 ? config.languages[0]!.lang : (config.languageCode.trim() === "" ? "en" : config.languageCode);
      const name = config.languages.length > 0 ? config.languages[0]!.languageName : lang;
      const dir = config.languages.length > 0 ? config.languages[0]!.languageDirection : "ltr";
      this.Language = new LanguageContext(lang, name, dir);
      this.languageCode = lang;  // Use computed lang, not config.languageCode, for consistency
    }

    // Set all languages
    // Note: IsMultiLingual is false until per-language build is implemented.
    // Even with multiple configured languages, we only build for one language currently.
    if (allLanguages !== undefined && allLanguages.length > 0) {
      this.Languages = allLanguages;
    } else {
      const langs: LanguageContext[] = [this.Language];
      this.Languages = langs;
    }
    this.IsMultiLingual = false; // TODO: Set true when per-language build is implemented

    // Set language prefix (e.g., "/fr" for non-default language)
    this.LanguagePrefix = "";

    this.Params = config.Params;
    this.Menus = config.Menus;
    this.Taxonomies = new Dictionary<string, Dictionary<string, PageContext[]>>();
    this.store = undefined;
    this.pages = pages;
    this.allPages = pages;
    this.home = undefined;
    const empty: DocsMountContext[] = [];
    this.docsMounts = empty;
    const emptySites: SiteContext[] = [];
    this.Sites = emptySites;
  }

  getOutputFormats(): OutputFormat[] {
    const rss = new OutputFormat("alternate", "application/rss+xml", this.baseURL + "index.xml");
    const formats: OutputFormat[] = [rss];
    return formats;
  }
}

export class PageContext {
  readonly title: string;
  readonly date: string;
  readonly lastmod: string;
  readonly draft: boolean;
  readonly kind: string;
  readonly section: string;
  readonly type: string;
  readonly slug: string;
  readonly relPermalink: string;
  readonly plain: string;
  readonly tableOfContents: HtmlString;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly description: string;
  readonly tags: string[];
  readonly categories: string[];
  readonly Params: Dictionary<string, ParamValue>;
  readonly File: PageFile | undefined;
  readonly Language: LanguageContext;
  readonly Translations: PageContext[];
  readonly store: object | undefined;
  readonly site: SiteContext;
  readonly pages: PageContext[];
  readonly layout: string | undefined;
  parent: PageContext | undefined;
  ancestors: PageContext[];

  constructor(
    title: string,
    date: string,
    lastmod: string,
    draft: boolean,
    kind: string,
    section: string,
    type: string,
    slug: string,
    relPermalink: string,
    plain: string,
    tableOfContents: HtmlString,
    content: HtmlString,
    summary: HtmlString,
    description: string,
    tags: string[],
    categories: string[],
    Params: Dictionary<string, ParamValue>,
    file: PageFile | undefined,
    language: LanguageContext,
    translations: PageContext[],
    store: object | undefined,
    site: SiteContext,
    pages: PageContext[],
    parent: PageContext | undefined,
    ancestors: PageContext[],
    layout?: string,
  ) {
    this.title = title;
    this.date = date;
    this.lastmod = lastmod;
    this.draft = draft;
    this.kind = kind;
    this.section = section;
    this.type = type;
    this.slug = slug;
    this.relPermalink = relPermalink;
    this.plain = plain;
    this.tableOfContents = tableOfContents;
    this.content = content;
    this.summary = summary;
    this.description = description;
    this.tags = tags;
    this.categories = categories;
    this.Params = Params;
    this.File = file;
    this.Language = language;
    this.Translations = translations;
    this.store = store;
    this.site = site;
    this.pages = pages;
    this.layout = layout;
    this.parent = parent;
    this.ancestors = ancestors;
  }
}

export class BuildRequest {
  siteDir: string;
  destinationDir: string;
  baseURL: string | undefined;
  themesDir: string | undefined;
  buildDrafts: boolean;
  cleanDestinationDir: boolean;

  constructor(siteDir: string) {
    this.siteDir = siteDir;
    this.destinationDir = "public";
    this.baseURL = undefined;
    this.themesDir = undefined;
    this.buildDrafts = false;
    this.cleanDestinationDir = true;
  }
}

export class ServeRequest extends BuildRequest {
  host: string;
  port: int;
  watch: boolean;

  constructor(siteDir: string) {
    super(siteDir);
    this.host = "localhost";
    this.port = 1313;
    this.watch = true;
  }
}

export class BuildResult {
  readonly outputDir: string;
  readonly pagesBuilt: int;

  constructor(outputDir: string, pagesBuilt: int) {
    this.outputDir = outputDir;
    this.pagesBuilt = pagesBuilt;
  }
}
