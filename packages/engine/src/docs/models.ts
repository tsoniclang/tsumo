import type { int } from "@tsonic/core/types.js";

export class DocsMountConfig {
  name: string;
  sourceDir: string;
  urlPrefix: string;
  repoUrl: string | undefined;
  repoBranch: string;
  repoPath: string | undefined;
  navPath: string | undefined;

  constructor(
    name: string,
    sourceDir: string,
    urlPrefix: string,
    repoUrl: string | undefined,
    repoBranch: string,
    repoPath: string | undefined,
    navPath: string | undefined,
  ) {
    this.name = name;
    this.sourceDir = sourceDir;
    this.urlPrefix = urlPrefix;
    this.repoUrl = repoUrl;
    this.repoBranch = repoBranch;
    this.repoPath = repoPath;
    this.navPath = navPath;
  }
}

export class DocsSiteConfig {
  mounts: DocsMountConfig[];
  strictLinks: boolean;
  generateSearchIndex: boolean;
  searchIndexFileName: string;
  homeMount: string | undefined;
  siteName: string;

  constructor(
    mounts: DocsMountConfig[],
    strictLinks: boolean,
    generateSearchIndex: boolean,
    searchIndexFileName: string,
    homeMount: string | undefined,
    siteName: string,
  ) {
    this.mounts = mounts;
    this.strictLinks = strictLinks;
    this.generateSearchIndex = generateSearchIndex;
    this.searchIndexFileName = searchIndexFileName;
    this.homeMount = homeMount;
    this.siteName = siteName;
  }
}

export class NavItem {
  title: string;
  url: string;
  children: NavItem[];
  isSection: boolean;
  isCurrent: boolean;
  order: int;

  constructor(
    title: string,
    url: string,
    children: NavItem[],
    isSection: boolean,
    isCurrent: boolean,
    order: int,
  ) {
    this.title = title;
    this.url = url;
    this.children = children;
    this.isSection = isSection;
    this.isCurrent = isCurrent;
    this.order = order;
  }
}

export class DocsMountContext {
  name: string;
  urlPrefix: string;
  nav: NavItem[];

  constructor(name: string, urlPrefix: string, nav: NavItem[]) {
    this.name = name;
    this.urlPrefix = urlPrefix;
    this.nav = nav;
  }
}

