import type { FrontMatterMenu } from "../frontmatter.js";
import type { PageFile } from "../models.js";
import type { ParamValue } from "../params.js";

export class ContentPageSource {
  sourcePath: string;
  section: string;
  type: string;
  slug: string;
  title: string;
  dateUtc: Date;
  dateString: string;
  lastmodString: string;
  draft: boolean;
  leafBundle: boolean;
  description: string;
  tags: string[];
  categories: string[];
  parameters: Map<string, ParamValue>;
  rawBody: string;
  relPermalink: string;
  outputRelPath: string;
  layout: string | undefined;
  file: PageFile;
  menus: FrontMatterMenu[];

  constructor(
    sourcePath: string,
    section: string,
    type: string,
    slug: string,
    title: string,
    dateUtc: Date,
    dateString: string,
    lastmodString: string,
    draft: boolean,
    leafBundle: boolean,
    description: string,
    tags: string[],
    categories: string[],
    parameters: Map<string, ParamValue>,
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
    this.leafBundle = leafBundle;
    this.description = description;
    this.tags = tags;
    this.categories = categories;
    this.parameters = parameters;
    this.rawBody = rawBody;
    this.relPermalink = relPermalink;
    this.outputRelPath = outputRelPath;
    this.layout = layout;
    this.file = file;
    this.menus = menus;
  }
}

export class ListPageSource {
  title: string | undefined;
  rawBody: string;
  description: string;
  type: string | undefined;
  layout: string | undefined;
  parameters: Map<string, ParamValue>;
  sourceDir: string;
  file: PageFile;

  constructor(
    title: string | undefined,
    rawBody: string,
    description: string,
    type: string | undefined,
    layout: string | undefined,
    parameters: Map<string, ParamValue>,
    sourceDir: string,
    file: PageFile,
  ) {
    this.title = title;
    this.rawBody = rawBody;
    this.description = description;
    this.type = type;
    this.layout = layout;
    this.parameters = parameters;
    this.sourceDir = sourceDir;
    this.file = file;
  }
}

export class ContentInventory {
  pages: ContentPageSource[];
  listPagesByRoute: Map<string, ListPageSource>;

  constructor(pages: ContentPageSource[], listPagesByRoute: Map<string, ListPageSource>) {
    this.pages = pages;
    this.listPagesByRoute = listPagesByRoute;
  }
}
