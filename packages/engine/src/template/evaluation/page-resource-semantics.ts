import { discoverPageBundleResourceFiles } from "../../resources/page-bundle.js";
import { resourceGlobMatches } from "../../resources/glob.js";
import { resourceMatchesMediaType } from "../../resources/media-types.js";
import { normalizeResourceRelativePath } from "../../resources/paths.js";
import { AnyArrayValue, PageResourcesValue, ResourceValue, TemplateValue } from "../values.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { trimEndCharacter, trimSlashes } from "./serialization.js";

export class PageResourceEntry {
  relativePath: string;
  value: ResourceValue;

  constructor(relativePath: string, value: ResourceValue) {
    this.relativePath = relativePath;
    this.value = value;
  }
}

const pageResourceTemplateValues = (entries: PageResourceEntry[]): TemplateValue[] => {
  const values: TemplateValue[] = [];
  for (let index = 0; index < entries.length; index++) values.push(entries[index]!.value);
  return values;
};

export class PageResourceCollectionValue extends AnyArrayValue {
  entries: PageResourceEntry[];

  constructor(entries: PageResourceEntry[]) {
    super(pageResourceTemplateValues(entries));
    this.entries = entries;
  }
}

const pageResourceEntries = (resources: PageResourcesValue): PageResourceEntry[] => {
  const sourceDirectory = resources.page.resourceSourceDir;
  if (sourceDirectory === undefined) return [];
  const files = discoverPageBundleResourceFiles(sourceDirectory);
  const entries: PageResourceEntry[] = [];
  const base = trimSlashes(resources.page.relPermalink);
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    const outputPath = base === "" ? file.relativePath : `${trimEndCharacter(base, "/")}/${file.relativePath}`;
    const identity = `page-resource:${resources.page.relPermalink}:${file.relativePath}`;
    entries.push(new PageResourceEntry(
      file.relativePath,
      new ResourceValue(resources.manager, resources.manager.loadFile(identity, file.sourcePath, outputPath)),
    ));
  }
  return entries;
};

export const getPageResource = (resources: PageResourcesValue, pathRaw: string): TemplateValue => {
  const path = normalizeResourceRelativePath(pathRaw);
  if (path === "") return nil;
  const entries = pageResourceEntries(resources);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.relativePath === path) return entry.value;
  }
  return nil;
};

export const getMatchingPageResource = (resources: PageResourcesValue, pattern: string): TemplateValue => {
  return getMatchingPageResourceFromCollection(new PageResourceCollectionValue(pageResourceEntries(resources)), pattern);
};

export const getMatchingPageResourceFromCollection = (
  resources: PageResourceCollectionValue,
  pattern: string,
): TemplateValue => {
  const entries = resources.entries;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (resourceGlobMatches(pattern, entry.relativePath)) return entry.value;
  }
  return nil;
};

export const getMatchingPageResources = (
  resources: PageResourcesValue,
  pattern: string,
): PageResourceCollectionValue => getMatchingPageResourcesFromCollection(
  new PageResourceCollectionValue(pageResourceEntries(resources)),
  pattern,
);

export const getMatchingPageResourcesFromCollection = (
  resources: PageResourceCollectionValue,
  pattern: string,
): PageResourceCollectionValue => {
  const selected: PageResourceEntry[] = [];
  for (let index = 0; index < resources.entries.length; index++) {
    const entry = resources.entries[index]!;
    if (resourceGlobMatches(pattern, entry.relativePath)) selected.push(entry);
  }
  return new PageResourceCollectionValue(selected);
};

const filterPageResourcesByType = (
  entries: PageResourceEntry[],
  mediaType: string,
): PageResourceCollectionValue => {
  const selected: PageResourceEntry[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (resourceMatchesMediaType(entry.value.value.mediaType, mediaType)) selected.push(entry);
  }
  return new PageResourceCollectionValue(selected);
};

export const getPageResourcesByType = (
  resources: PageResourcesValue,
  mediaType: string,
): PageResourceCollectionValue => filterPageResourcesByType(pageResourceEntries(resources), mediaType);

export const getPageResourceCollectionByType = (
  resources: PageResourceCollectionValue,
  mediaType: string,
): PageResourceCollectionValue => filterPageResourcesByType(resources.entries, mediaType);

export const callPageResourcesMethod = (
  resources: PageResourcesValue,
  methodName: string,
  args: TemplateValue[],
): TemplateValue | undefined => {
  const method = methodName.toLowerCase();
  if (method === "get" && args.length >= 1) return getPageResource(resources, toPlainString(args[0]!));
  if (method === "getmatch" && args.length >= 1) return getMatchingPageResource(resources, toPlainString(args[0]!));
  if (method === "match" && args.length >= 1) return getMatchingPageResources(resources, toPlainString(args[0]!));
  if (method === "bytype" && args.length >= 1) return getPageResourcesByType(resources, toPlainString(args[0]!));
  return undefined;
};

export const callPageResourceCollectionMethod = (
  resources: PageResourceCollectionValue,
  methodName: string,
  args: TemplateValue[],
): TemplateValue | undefined => {
  const method = methodName.toLowerCase();
  if (method === "getmatch" && args.length >= 1) {
    return getMatchingPageResourceFromCollection(resources, toPlainString(args[0]!));
  }
  if (method === "match" && args.length >= 1) {
    return getMatchingPageResourcesFromCollection(resources, toPlainString(args[0]!));
  }
  if (method === "bytype" && args.length >= 1) {
    return getPageResourceCollectionByType(resources, toPlainString(args[0]!));
  }
  return undefined;
};
