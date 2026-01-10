import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";

export const dirExists = (path: string): boolean => Directory.exists(path);

export const fileExists = (path: string): boolean => File.exists(path);

export const ensureDir = (path: string): void => {
  Directory.createDirectory(path);
};

export const readTextFile = (path: string): string => File.readAllText(path);

export const writeTextFile = (path: string, content: string): void => {
  const dir = Path.getDirectoryName(path);
  if (dir !== undefined && dir !== "") {
    Directory.createDirectory(dir);
  }
  File.writeAllText(path, content);
};

export const deleteDirRecursive = (path: string): void => {
  if (!Directory.exists(path)) return;
  Directory.delete_(path, true);
};

export const listFilesRecursive = (rootDir: string, searchPattern: string): string[] => {
  if (!Directory.exists(rootDir)) return [];
  return Directory.getFiles(rootDir, searchPattern, SearchOption.allDirectories);
};

export const copyDirRecursive = (srcDir: string, destDir: string): void => {
  if (!Directory.exists(srcDir)) return;
  Directory.createDirectory(destDir);

  const files = Directory.getFiles(srcDir, "*", SearchOption.allDirectories);
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i]!;
    const rel = Path.getRelativePath(srcDir, srcFile);
    const destFile = Path.combine(destDir, rel);
    const destFileDir = Path.getDirectoryName(destFile);
    if (destFileDir !== undefined && destFileDir !== "") {
      Directory.createDirectory(destFileDir);
    }
    File.copy(srcFile, destFile, true);
  }
};
