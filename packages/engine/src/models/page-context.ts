import { HtmlString } from "../utils/html.js";
import { ParamValue } from "../params.js";
import { LanguageContext } from "./language.js";
import { PageFile } from "./page-file.js";
import type { SiteContext } from "./site-context.js";
import type { ScratchStore } from "../template/values/scratch.js";

export class PageContext {
  title: string;
  date: string;
  lastmod: string;
  draft: boolean;
  kind: string;
  section: string;
  type: string;
  slug: string;
  relPermalink: string;
  plain: string;
  tableOfContents: HtmlString;
  content: HtmlString;
  summary: HtmlString;
  description: string;
  tags: string[];
  categories: string[];
  Params: Map<string, ParamValue>;
  File: PageFile | undefined;
  Language: LanguageContext;
  Translations: PageContext[];
  store: ScratchStore | undefined;
  site: SiteContext;
  pages: PageContext[];
  layout: string | undefined;
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
    Params: Map<string, ParamValue>,
    file: PageFile | undefined,
    language: LanguageContext,
    translations: PageContext[],
    store: ScratchStore | undefined,
    site: SiteContext,
    pages: PageContext[],
    parent: PageContext | undefined,
    ancestors: PageContext[],
    layout: string | undefined,
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
