import { statSync } from "node:fs";
import { parseContent, ParsedContent } from "../frontmatter.js";
import { readTextFile } from "../fs.js";
import { DocsMarkdownRoute } from "./routes.js";

export class DocsContentRoute {
  route: DocsMarkdownRoute;
  parsed: ParsedContent;
  modifiedAt: Date;

  constructor(route: DocsMarkdownRoute, parsed: ParsedContent, modifiedAt: Date) {
    this.route = route;
    this.parsed = parsed;
    this.modifiedAt = modifiedAt;
  }
}

export class DocsContentInventory {
  indexByDirectory: Map<string, DocsContentRoute>;
  leaves: DocsContentRoute[];
  permalinkByRelativePath: Map<string, string>;

  constructor(
    indexByDirectory: Map<string, DocsContentRoute>,
    leaves: DocsContentRoute[],
    permalinkByRelativePath: Map<string, string>,
  ) {
    this.indexByDirectory = indexByDirectory;
    this.leaves = leaves;
    this.permalinkByRelativePath = permalinkByRelativePath;
  }
}

export const loadDocsContent = (routes: DocsMarkdownRoute[], buildDrafts: boolean): DocsContentInventory => {
  const indexByDirectory = new Map<string, DocsContentRoute>();
  const leaves: DocsContentRoute[] = [];
  const permalinkByRelativePath = new Map<string, string>();

  for (let index = 0; index < routes.length; index++) {
    const route = routes[index]!;
    const parsed = parseContent(readTextFile(route.sourcePath), route.sourcePath);
    const content = new DocsContentRoute(route, parsed, statSync(route.sourcePath).mtime);
    if (route.isIndex) {
      indexByDirectory.set(route.dirKey, content);
      permalinkByRelativePath.set(route.relPath.toLowerCase(), route.relPermalink);
      continue;
    }
    if (parsed.frontMatter.draft && !buildDrafts) continue;
    leaves.push(content);
    permalinkByRelativePath.set(route.relPath.toLowerCase(), route.relPermalink);
  }

  return new DocsContentInventory(indexByDirectory, leaves, permalinkByRelativePath);
};
