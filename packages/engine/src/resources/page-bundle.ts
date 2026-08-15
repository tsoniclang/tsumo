import { basename, join } from "node:path";

import { fileExists, listDirectoriesTopDirectory, listFilesTopDirectory } from "../fs.js";
import { compareText } from "../utils/strings.js";

export class PageBundleResourceFile {
  sourcePath: string;
  relativePath: string;

  constructor(sourcePath: string, relativePath: string) {
    this.sourcePath = sourcePath;
    this.relativePath = relativePath;
  }
}

const sortPaths = (paths: string[]): void => {
  paths.sort((left: string, right: string) => compareText(left, right));
};

const isNestedBundle = (directory: string): boolean =>
  fileExists(join(directory, "index.md")) || fileExists(join(directory, "_index.md"));

const collectPageBundleResourceFiles = (
  directory: string,
  prefix: string,
  result: PageBundleResourceFile[],
): void => {
  const files = listFilesTopDirectory(directory, "*");
  sortPaths(files);
  for (let index = 0; index < files.length; index++) {
    const sourcePath = files[index]!;
    if (sourcePath.toLowerCase().endsWith(".md")) continue;
    const name = basename(sourcePath);
    if (name === "") continue;
    const relativePath = prefix === "" ? name : `${prefix}/${name}`;
    result.push(new PageBundleResourceFile(sourcePath, relativePath));
  }

  const directories = listDirectoriesTopDirectory(directory);
  sortPaths(directories);
  for (let index = 0; index < directories.length; index++) {
    const child = directories[index]!;
    if (isNestedBundle(child) || listFilesTopDirectory(child, "*.md").length > 0) continue;
    const name = basename(child);
    if (name === "") continue;
    collectPageBundleResourceFiles(child, prefix === "" ? name : `${prefix}/${name}`, result);
  }
};

export const discoverPageBundleResourceFiles = (directory: string): PageBundleResourceFile[] => {
  const result: PageBundleResourceFile[] = [];
  collectPageBundleResourceFiles(directory, "", result);
  return result;
};
