import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { HtmlString } from "./utils/html.ts";

export class SiteConfig {
  title: string;
  baseURL: string;
  languageCode: string;
  theme: string | undefined;
  Params: Dictionary<string, string>;

  constructor(title: string, baseURL: string, languageCode: string, theme: string | undefined) {
    this.title = title;
    this.baseURL = baseURL;
    this.languageCode = languageCode;
    this.theme = theme;
    this.Params = new Dictionary<string, string>();
  }
}

export class SiteContext {
  readonly title: string;
  readonly baseURL: string;
  readonly languageCode: string;
  readonly Params: Dictionary<string, string>;
  pages: PageContext[];

  constructor(config: SiteConfig, pages: PageContext[]) {
    this.title = config.title;
    this.baseURL = config.baseURL;
    this.languageCode = config.languageCode;
    this.Params = config.Params;
    this.pages = pages;
  }
}

export class PageContext {
  readonly title: string;
  readonly date: string;
  readonly draft: boolean;
  readonly section: string;
  readonly slug: string;
  readonly relPermalink: string;
  readonly content: HtmlString;
  readonly summary: HtmlString;
  readonly tags: string[];
  readonly categories: string[];
  readonly Params: Dictionary<string, string>;
  readonly site: SiteContext;
  readonly pages: PageContext[];

  constructor(
    title: string,
    date: string,
    draft: boolean,
    section: string,
    slug: string,
    relPermalink: string,
    content: HtmlString,
    summary: HtmlString,
    tags: string[],
    categories: string[],
    Params: Dictionary<string, string>,
    site: SiteContext,
    pages: PageContext[],
  ) {
    this.title = title;
    this.date = date;
    this.draft = draft;
    this.section = section;
    this.slug = slug;
    this.relPermalink = relPermalink;
    this.content = content;
    this.summary = summary;
    this.tags = tags;
    this.categories = categories;
    this.Params = Params;
    this.site = site;
    this.pages = pages;
  }
}

export class BuildRequest {
  siteDir: string;
  destinationDir: string;
  baseURL: string | undefined;
  buildDrafts: boolean;
  cleanDestinationDir: boolean;

  constructor(siteDir: string) {
    this.siteDir = siteDir;
    this.destinationDir = "public";
    this.baseURL = undefined;
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
