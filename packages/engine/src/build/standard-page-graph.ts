import { Path } from "@tsonic/dotnet/System.IO.js";
import { configureSiteMenus } from "./menu-resolution.js";
import { ContentInventory, ContentPageSource, ListPageSource } from "./content-model.js";
import { createTsumoError } from "../diagnostics.js";
import { PageContext, SiteConfig, SiteContext, LanguageContext } from "../models.js";
import { ParamValue } from "../params.js";
import { HtmlString } from "../utils/html.js";
import { humanizeSlug } from "../utils/text.js";
import { combineUrl } from "./layout.js";
import { compareSitePaths, joinSitePath, splitSitePath } from "./site-routes.js";

export class StandardPageGraph {
  site: SiteContext;
  pageSources: ContentPageSource[];
  contentPages: PageContext[];
  listPagesByRoute: Map<string, PageContext>;
  listRoutes: string[];
  rawBodyByPage: Map<PageContext, string>;
  bundleSourceByPage: Map<PageContext, string>;
  home: PageContext;

  constructor(
    site: SiteContext,
    pageSources: ContentPageSource[],
    contentPages: PageContext[],
    listPagesByRoute: Map<string, PageContext>,
    listRoutes: string[],
    rawBodyByPage: Map<PageContext, string>,
    bundleSourceByPage: Map<PageContext, string>,
    home: PageContext,
  ) {
    this.site = site;
    this.pageSources = pageSources;
    this.contentPages = contentPages;
    this.listPagesByRoute = listPagesByRoute;
    this.listRoutes = listRoutes;
    this.rawBodyByPage = rawBodyByPage;
    this.bundleSourceByPage = bundleSourceByPage;
    this.home = home;
  }
}

const createSite = (config: SiteConfig): SiteContext => {
  const languages: LanguageContext[] = [];
  for (let index = 0; index < config.languages.length; index++) {
    const language = config.languages[index]!;
    languages.push(new LanguageContext(language.lang, language.languageName, language.languageDirection));
  }
  const selectedLanguage = config.languages.length > 0 ? config.languages[0] : undefined;
  const emptyPages: PageContext[] = [];
  const site = new SiteContext(config, emptyPages, selectedLanguage, languages.length > 0 ? languages : undefined);
  site.Sites = [site];
  return site;
};

const createContentPages = (
  sources: ContentPageSource[],
  site: SiteContext,
  rawBodyByPage: Map<PageContext, string>,
): PageContext[] => {
  const pages: PageContext[] = [];
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index]!;
    const emptyPages: PageContext[] = [];
    const emptyStrings: string[] = [];
    const emptyHtml = new HtmlString("");
    const page = new PageContext(
      source.title,
      source.dateString,
      source.lastmodString,
      source.draft,
      "page",
      source.section,
      source.type,
      source.slug,
      source.relPermalink,
      "",
      emptyHtml,
      emptyHtml,
      emptyHtml,
      source.description,
      source.tags,
      source.categories,
      source.parameters,
      source.file,
      site.Language,
      emptyPages,
      undefined,
      site,
      emptyPages,
      undefined,
      emptyPages,
      source.layout,
    );
    pages.push(page);
    rawBodyByPage.set(page, source.rawBody);
  }
  return pages;
};

const addRouteWithParents = (route: string, routes: Map<string, boolean>): void => {
  let current = route;
  while (true) {
    routes.set(current, true);
    if (current === "") return;
    const segments = splitSitePath(current);
    const parentSegments: string[] = [];
    for (let index = 0; index < segments.length - 1; index++) parentSegments.push(segments[index]!);
    current = joinSitePath(parentSegments);
  }
};

const collectListRoutes = (inventory: ContentInventory): string[] => {
  const routeSet = new Map<string, boolean>();
  routeSet.set("", true);
  for (let index = 0; index < inventory.pages.length; index++) {
    const section = inventory.pages[index]!.section;
    if (section !== "") routeSet.set(section, true);
  }
  for (const route of inventory.listPagesByRoute.keys()) addRouteWithParents(route, routeSet);
  const routes = Array.from(routeSet.keys());
  routes.sort((left: string, right: string) => {
    const depth = splitSitePath(left).length - splitSitePath(right).length;
    return depth !== 0 ? depth : compareSitePaths(left, right);
  });
  return routes;
};

const selectPagesForList = (route: string, pages: PageContext[]): PageContext[] => {
  if (route === "") return pages;
  const prefix = "/" + route + "/";
  const selected: PageContext[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]!;
    if (page.relPermalink.startsWith(prefix)) selected.push(page);
  }
  return selected;
};

const createListPage = (
  route: string,
  source: ListPageSource | undefined,
  site: SiteContext,
  contentPages: PageContext[],
): PageContext => {
  const routeSegments = route === "" ? [] : splitSitePath(route);
  const section = routeSegments.length > 0 ? routeSegments[0]! : "";
  const slug = routeSegments.length > 0 ? routeSegments[routeSegments.length - 1]! : "";
  const kind = route === "" ? "home" : "section";
  const defaultType = route === "" ? "home" : section !== "" ? section : "section";
  const configuredType = source?.type;
  const pageType = configuredType === undefined || configuredType.trim() === "" ? defaultType : configuredType;
  const defaultTitle = route === "" ? site.title : humanizeSlug(slug);
  const title = source?.title ?? defaultTitle;
  const emptyStrings: string[] = [];
  const emptyPages: PageContext[] = [];
  const emptyHtml = new HtmlString("");
  const parameters = source?.parameters ?? new Map<string, ParamValue>();
  return new PageContext(
    title,
    "",
    "",
    false,
    kind,
    section,
    pageType,
    slug,
    route === "" ? "/" : combineUrl(routeSegments),
    "",
    emptyHtml,
    emptyHtml,
    emptyHtml,
    source?.description ?? "",
    emptyStrings,
    emptyStrings,
    parameters,
    source?.file,
    site.Language,
    emptyPages,
    undefined,
    site,
    selectPagesForList(route, contentPages),
    undefined,
    emptyPages,
    source?.layout,
  );
};

const findListParent = (
  route: string,
  listPagesByRoute: Map<string, PageContext>,
  home: PageContext,
): PageContext => {
  let segments = splitSitePath(route);
  while (segments.length > 1) {
    const parentSegments: string[] = [];
    for (let index = 0; index < segments.length - 1; index++) parentSegments.push(segments[index]!);
    const parent = listPagesByRoute.get(joinSitePath(parentSegments));
    if (parent !== undefined) return parent;
    segments = parentSegments;
  }
  return home;
};

const findContentParent = (
  page: PageContext,
  listRoutes: string[],
  listPagesByRoute: Map<string, PageContext>,
  home: PageContext,
): PageContext => {
  for (let index = listRoutes.length - 1; index >= 0; index--) {
    const route = listRoutes[index]!;
    if (route === "") continue;
    if (page.relPermalink.startsWith("/" + route + "/")) {
      const parent = listPagesByRoute.get(route);
      if (parent !== undefined) return parent;
    }
  }
  return home;
};

const createAncestors = (parent: PageContext | undefined): PageContext[] => {
  const reversed: PageContext[] = [];
  let current = parent;
  while (true) {
    const ancestor = current;
    if (ancestor === undefined) break;
    reversed.push(ancestor);
    current = ancestor.parent;
  }
  const ancestors: PageContext[] = [];
  for (let index = reversed.length - 1; index >= 0; index--) ancestors.push(reversed[index]!);
  return ancestors;
};

const assignPageRelationships = (
  listRoutes: string[],
  listPagesByRoute: Map<string, PageContext>,
  contentPages: PageContext[],
  home: PageContext,
): void => {
  home.parent = undefined;
  home.ancestors = [];
  for (let index = 0; index < listRoutes.length; index++) {
    const route = listRoutes[index]!;
    if (route === "") continue;
    const page = listPagesByRoute.get(route);
    if (page === undefined) continue;
    const parent = findListParent(route, listPagesByRoute, home);
    page.parent = parent;
    page.ancestors = createAncestors(parent);
  }
  for (let index = 0; index < contentPages.length; index++) {
    const page = contentPages[index]!;
    const parent = findContentParent(page, listRoutes, listPagesByRoute, home);
    page.parent = parent;
    page.ancestors = createAncestors(parent);
  }
};

export const createStandardPageGraph = (
  config: SiteConfig,
  inventory: ContentInventory,
): StandardPageGraph => {
  const site = createSite(config);
  const rawBodyByPage = new Map<PageContext, string>();
  const bundleSourceByPage = new Map<PageContext, string>();
  const contentPages = createContentPages(inventory.pages, site, rawBodyByPage);
  site.pages = contentPages;

  const listRoutes = collectListRoutes(inventory);
  const listPagesByRoute = new Map<string, PageContext>();
  for (let index = 0; index < listRoutes.length; index++) {
    const route = listRoutes[index]!;
    const source = inventory.listPagesByRoute.get(route);
    const page = createListPage(route, source, site, contentPages);
    listPagesByRoute.set(route, page);
    if (source !== undefined) {
      rawBodyByPage.set(page, source.rawBody);
      bundleSourceByPage.set(page, source.sourceDir);
    }
  }
  const home = listPagesByRoute.get("");
  if (home === undefined) {
    throw createTsumoError("TSUMO_PAGE_GRAPH_HOME_MISSING", "Standard page graph requires a home page");
  }

  assignPageRelationships(listRoutes, listPagesByRoute, contentPages, home);
  site.home = home;
  const allPages: PageContext[] = [home];
  for (let index = 0; index < listRoutes.length; index++) {
    const route = listRoutes[index]!;
    if (route === "") continue;
    const page = listPagesByRoute.get(route);
    if (page !== undefined) allPages.push(page);
  }
  for (let index = 0; index < contentPages.length; index++) allPages.push(contentPages[index]!);
  site.allPages = allPages;

  for (let index = 0; index < inventory.pages.length; index++) {
    const source = inventory.pages[index]!;
    if (!source.leafBundle) continue;
    const sourceDirectory = Path.GetDirectoryName(source.sourcePath);
    if (sourceDirectory !== undefined && sourceDirectory !== "") {
      bundleSourceByPage.set(contentPages[index]!, sourceDirectory);
    }
  }

  configureSiteMenus(inventory.pages, contentPages, site);
  return new StandardPageGraph(
    site,
    inventory.pages,
    contentPages,
    listPagesByRoute,
    listRoutes,
    rawBodyByPage,
    bundleSourceByPage,
    home,
  );
};
