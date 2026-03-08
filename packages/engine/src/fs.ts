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
import { dirname, join, relative } from "node:path";

const matchesPattern = (filePath: string, searchPattern: string): boolean => {
  if (searchPattern === "*" || searchPattern === "*.*") return true;
  if (searchPattern.startsWith("*.")) return filePath.toLowerCase().endsWith(searchPattern.substring(1).toLowerCase());
  return filePath.endsWith(searchPattern);
};

export const dirExists = (path: string): boolean => {
  return existsSync(path) && statSync(path).isDirectory;
};

export const fileExists = (path: string): boolean => {
  return existsSync(path) && statSync(path).isFile;
};

export const ensureDir = (path: string): void => {
  mkdirSync(path, { recursive: true });
};

export const readTextFile = (path: string): string => readFileSync(path, "utf-8");

export const writeTextFile = (path: string, content: string): void => {
  const dir = dirname(path);
  if (dir !== "") {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, content, "utf-8");
};

export const deleteDirRecursive = (path: string): void => {
  if (!dirExists(path)) return;
  rmSync(path, true);
};

export const listFilesRecursive = (rootDir: string, searchPattern: string): string[] => {
  if (!dirExists(rootDir)) return [];

  const files: string[] = [];

  const walk = (currentDir: string): void => {
    const entries = readdirSync(currentDir);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const fullPath = join(currentDir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory) {
        walk(fullPath);
        continue;
      }
      if (matchesPattern(fullPath, searchPattern)) {
        files.push(fullPath);
      }
    }
  };

  walk(rootDir);
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
