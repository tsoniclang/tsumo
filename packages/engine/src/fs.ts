import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { Buffer } from "node:buffer";
import { dirname, join, relative } from "node:path";
import { File, FileAttributes } from "@tsonic/dotnet/System.IO.js";
import { createTsumoError } from "./diagnostics.js";
import { compareText } from "./utils/strings.js";

const matchesPattern = (filePath: string, searchPattern: string): boolean => {
  if (searchPattern === "*" || searchPattern === "*.*") return true;
  if (searchPattern.startsWith("*.")) return filePath.toLowerCase().endsWith(searchPattern.substring(1).toLowerCase());
  return filePath.endsWith(searchPattern);
};

class ManagedDirectoryEntry {
  path: string;
  directory: boolean;

  constructor(path: string, directory: boolean) {
    this.path = path;
    this.directory = directory;
  }
}

export const dirExists = (path: string): boolean => {
  return existsSync(path) && statSync(path).isDirectory();
};

export const fileExists = (path: string): boolean => {
  return existsSync(path) && statSync(path).isFile();
};

export const ensureDir = (path: string): void => {
  mkdirSync(path, true);
};

export const readTextFile = (path: string): string => {
  rejectFilesystemLink(path);
  return readFileSync(path, "utf-8");
};

export const readBinaryFile = (path: string): Buffer => {
  rejectFilesystemLink(path);
  return readFileSync(path);
};

export const writeTextFile = (path: string, content: string): void => {
  const dir = dirname(path);
  if (dir !== "") {
    mkdirSync(dir, true);
  }
  writeFileSync(path, content, "utf-8");
};

export const deleteDirRecursive = (path: string): void => {
  if (!dirExists(path)) return;
  rmSync(path, true);
};

export const rejectFilesystemLink = (path: string): void => {
  const attributes = File.GetAttributes(path);
  if ((attributes & FileAttributes.ReparsePoint) !== FileAttributes.ReparsePoint) return;
  throw createTsumoError(
    "TSUMO_FILESYSTEM_LINK_UNSUPPORTED",
    "Symbolic links and filesystem reparse points are not supported in Tsumo-managed filesystem trees",
    path,
  );
};

const listManagedDirectoryEntries = (directory: string): ManagedDirectoryEntry[] => {
  if (!dirExists(directory)) return [];
  rejectFilesystemLink(directory);
  const names = readdirSync(directory);
  const entries: ManagedDirectoryEntry[] = [];
  for (let index = 0; index < names.length; index++) {
    const path = join(directory, names[index]!);
    rejectFilesystemLink(path);
    entries.push(new ManagedDirectoryEntry(path, statSync(path).isDirectory()));
  }
  entries.sort((left: ManagedDirectoryEntry, right: ManagedDirectoryEntry) => compareText(left.path, right.path));
  return entries;
};

export const listFilesTopDirectory = (rootDir: string, searchPattern: string): string[] => {
  const entries = listManagedDirectoryEntries(rootDir);
  const files: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (!entry.directory && matchesPattern(entry.path, searchPattern)) files.push(entry.path);
  }
  return files;
};

export const listDirectoriesTopDirectory = (rootDir: string): string[] => {
  const entries = listManagedDirectoryEntries(rootDir);
  const directories: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.directory) directories.push(entry.path);
  }
  return directories;
};

export const listFilesRecursive = (rootDir: string, searchPattern: string): string[] => {
  const files: string[] = [];

  const walk = (currentDir: string): void => {
    const entries = listManagedDirectoryEntries(currentDir);
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (entry.directory) {
        walk(entry.path);
        continue;
      }
      if (matchesPattern(entry.path, searchPattern)) {
        files.push(entry.path);
      }
    }
  };

  walk(rootDir);
  files.sort((left: string, right: string) => compareText(left, right));
  return files;
};

export const copyDirRecursive = (srcDir: string, destDir: string): void => {
  if (!dirExists(srcDir)) return;
  ensureDir(destDir);

  const files = listFilesRecursive(srcDir, "*");
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i]!;
    const relPath = relative(srcDir, srcFile);
    const destFile = join(destDir, relPath);
    ensureDir(dirname(destFile));
    copyFileSync(srcFile, destFile);
  }
};
