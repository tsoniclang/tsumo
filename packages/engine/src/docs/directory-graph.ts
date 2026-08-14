import type { int32 } from "@tsonic/core/types.js";
import { PageContext } from "../models.js";
import { substringCount, substringFrom } from "../utils/strings.js";

export const addDocsDirectoryWithParents = (directory: string, directories: Map<string, boolean>): void => {
  let current = directory.trim();
  while (true) {
    directories.set(current, true);
    if (current === "") return;
    const separator = current.lastIndexOf("/");
    current = separator < 0 ? "" : substringCount(current, 0, separator);
  }
};

export const docsDirectoryDepth = (directory: string): int32 => {
  if (directory === "") return 0;
  let depth: int32 = 1;
  let position = 0;
  while (true) {
    const separator = directory.indexOf("/", position);
    if (separator < 0) return depth;
    depth++;
    position = separator + 1;
  }
};

export const docsParentDirectory = (directory: string): string => {
  const separator = directory.lastIndexOf("/");
  return separator < 0 ? "" : substringCount(directory, 0, separator);
};

export const docsDirectoryName = (directory: string): string => {
  const separator = directory.lastIndexOf("/");
  return separator < 0 ? directory : substringFrom(directory, separator + 1);
};

export const assignDocsPageAncestry = (
  page: PageContext,
  parent: PageContext | undefined,
  ancestors: PageContext[],
): void => {
  page.parent = parent;
  page.ancestors = ancestors;
  if (page.kind === "page") return;

  for (let index = 0; index < page.pages.length; index++) {
    const child = page.pages[index]!;
    const childAncestors: PageContext[] = [];
    for (let ancestorIndex = 0; ancestorIndex < ancestors.length; ancestorIndex++) {
      childAncestors.push(ancestors[ancestorIndex]!);
    }
    childAncestors.push(page);
    assignDocsPageAncestry(child, page, childAncestors);
  }
};
