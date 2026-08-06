import { createTsumoError } from "../diagnostics.js";
import { compareText, substringCount } from "../utils/strings.js";

export const normalizeSitePath = (path: string): string => path.replaceAll("\\", "/");

export const splitSitePath = (path: string): string[] => normalizeSitePath(path).split("/");

export const joinSitePath = (segments: string[]): string => segments.join("/");

export const withoutMarkdownExtension = (fileName: string): string =>
  fileName.toLowerCase().endsWith(".md")
    ? substringCount(fileName, 0, fileName.length - 3)
    : fileName;

export const siteOutputPath = (routeSegments: string[]): string =>
  routeSegments.length === 0 ? "index.html" : joinSitePath(routeSegments) + "/index.html";

export const assertSiteRouteSegment = (segment: string, sourcePath: string): void => {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes(":")
  ) {
    throw createTsumoError(
      "TSUMO_CONTENT_ROUTE_SEGMENT_INVALID",
      `Content route segment is invalid: ${segment}`,
      sourcePath,
    );
  }
};

export const compareSitePaths = (left: string, right: string): number =>
  compareText(normalizeSitePath(left), normalizeSitePath(right));
