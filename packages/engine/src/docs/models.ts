import type { int } from "@tsonic/core/types.js";

export class DocsMountConfig {
  readonly name: string;
  readonly sourceDir: string;
  readonly urlPrefix: string;
  readonly repoUrl: string | undefined;
  readonly repoBranch: string;
  readonly repoPath: string | undefined;
  readonly navPath: string | undefined;

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
  readonly mounts: DocsMountConfig[];
  readonly strictLinks: boolean;
  readonly generateSearchIndex: boolean;
  readonly searchIndexFileName: string;
  readonly homeMount: string | undefined;
  readonly siteName: string;

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
  readonly title: string;
  readonly url: string;
  readonly children: NavItem[];
  readonly isSection: boolean;
  readonly isCurrent: boolean;
  readonly order: int;

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
  readonly name: string;
  readonly urlPrefix: string;
  readonly nav: NavItem[];

  constructor(name: string, urlPrefix: string, nav: NavItem[]) {
    this.name = name;
    this.urlPrefix = urlPrefix;
    this.nav = nav;
  }
}

