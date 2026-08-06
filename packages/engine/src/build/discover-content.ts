import { statSync } from "node:fs";
import { Path } from "@tsonic/dotnet/System.IO.js";
import { createTsumoError } from "../diagnostics.js";
import { parseContent } from "../frontmatter.js";
import { listFilesRecursive, readTextFile } from "../fs.js";
import { PageFile } from "../models.js";
import { humanizeSlug, slugify } from "../utils/text.js";
import { compareText } from "../utils/strings.js";
import { ContentInventory, ContentPageSource, ListPageSource } from "./content-model.js";
import {
  assertSiteRouteSegment,
  compareSitePaths,
  joinSitePath,
  normalizeSitePath,
  siteOutputPath,
  splitSitePath,
  withoutMarkdownExtension,
} from "./site-routes.js";

const isBranchIndexFile = (name: string): boolean => name.toLowerCase() === "_index.md";

const isLeafBundleIndexFile = (name: string): boolean => name.toLowerCase() === "index.md";

const createPageFile = (directory: string, fileName: string, filePath: string): PageFile =>
  new PageFile(Path.GetFullPath(filePath), directory === "" ? "" : directory + "/", withoutMarkdownExtension(fileName));

const compareContentPages = (left: ContentPageSource, right: ContentPageSource): number => {
  const leftTime = left.dateUtc.getTime();
  const rightTime = right.dateUtc.getTime();
  if (rightTime > leftTime) return 1;
  if (rightTime < leftTime) return -1;
  const route = compareText(left.relPermalink, right.relPermalink);
  return route !== 0 ? route : compareSitePaths(left.sourcePath, right.sourcePath);
};

const assertUniqueOutput = (outputs: Map<string, string>, outputPath: string, sourcePath: string): void => {
  const key = outputPath.toLowerCase();
  const previous = outputs.get(key);
  if (previous !== undefined) {
    throw createTsumoError(
      "TSUMO_CONTENT_ROUTE_CONFLICT",
      `Content sources '${previous}' and '${sourcePath}' both map to '${outputPath}'`,
      sourcePath,
    );
  }
  outputs.set(key, sourcePath);
};

export const discoverContent = (
  contentDir: string,
  buildDrafts: boolean,
): ContentInventory => {
  const files = listFilesRecursive(contentDir, "*.md");
  files.sort((left: string, right: string) => compareSitePaths(left, right));

  const pages: ContentPageSource[] = [];
  const listPagesByRoute = new Map<string, ListPageSource>();
  const outputs = new Map<string, string>();

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const filePath = files[fileIndex]!;
    const relativePath = normalizeSitePath(Path.GetRelativePath(contentDir, filePath));
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith("../")) {
      throw createTsumoError(
        "TSUMO_CONTENT_SOURCE_PATH_INVALID",
        `Content source is outside its content root: ${filePath}`,
        filePath,
      );
    }
    const pathSegments = splitSitePath(relativePath);
    for (let index = 0; index < pathSegments.length; index++) {
      assertSiteRouteSegment(pathSegments[index]!, filePath);
    }
    const fileName = pathSegments[pathSegments.length - 1]!;
    const directorySegments: string[] = [];
    for (let index = 0; index < pathSegments.length - 1; index++) directorySegments.push(pathSegments[index]!);
    const directory = joinSitePath(directorySegments);

    const parsed = parseContent(readTextFile(filePath), filePath);
    const frontMatter = parsed.frontMatter;
    const modifiedAt = new Date(statSync(filePath).mtimeMs);
    const file = createPageFile(directory, fileName, filePath);

    if (isBranchIndexFile(fileName)) {
      if (listPagesByRoute.has(directory)) {
        throw createTsumoError(
          "TSUMO_CONTENT_ROUTE_CONFLICT",
          `Multiple branch indexes map to '${directory}'`,
          filePath,
        );
      }
      assertUniqueOutput(outputs, siteOutputPath(directorySegments), filePath);
      listPagesByRoute.set(
        directory,
        new ListPageSource(
          frontMatter.title,
          parsed.body,
          frontMatter.description ?? "",
          frontMatter.type,
          frontMatter.layout,
          frontMatter.Params,
          Path.GetDirectoryName(filePath) ?? contentDir,
          file,
        ),
      );
      continue;
    }

    const section = directorySegments.length > 0 ? directorySegments[0]! : "";
    const configuredType = frontMatter.type;
    const pageType = configuredType === undefined || configuredType.trim() === ""
      ? section !== "" ? section : "page"
      : configuredType;
    if (frontMatter.draft && !buildDrafts) continue;
    const isLeafBundle = isLeafBundleIndexFile(fileName) && directorySegments.length > 0;
    const defaultLeafName = isLeafBundle
      ? directorySegments[directorySegments.length - 1]!
      : withoutMarkdownExtension(fileName);
    const slug = frontMatter.slug ?? slugify(defaultLeafName);
    assertSiteRouteSegment(slug, filePath);

    const routeSegments: string[] = [];
    const directoryCount = isLeafBundle ? directorySegments.length - 1 : directorySegments.length;
    for (let index = 0; index < directoryCount; index++) routeSegments.push(directorySegments[index]!);
    routeSegments.push(slug);
    const outputRelPath = siteOutputPath(routeSegments);
    assertUniqueOutput(outputs, outputRelPath, filePath);

    const page = new ContentPageSource(
      filePath,
      section,
      pageType,
      slug,
      frontMatter.title ?? humanizeSlug(defaultLeafName),
      frontMatter.date ?? modifiedAt,
      (frontMatter.date ?? modifiedAt).toISOString(),
      modifiedAt.toISOString(),
      frontMatter.draft,
      isLeafBundle,
      frontMatter.description ?? "",
      frontMatter.tags,
      frontMatter.categories,
      frontMatter.Params,
      parsed.body,
      "/" + joinSitePath(routeSegments) + "/",
      outputRelPath,
      frontMatter.layout,
      file,
      frontMatter.menus,
    );
    pages.push(page);
  }

  pages.sort((left: ContentPageSource, right: ContentPageSource) => compareContentPages(left, right));
  return new ContentInventory(pages, listPagesByRoute);
};
