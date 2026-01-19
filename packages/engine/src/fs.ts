import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";

export const dirExists = (path: string): boolean => Directory.Exists(path);

export const fileExists = (path: string): boolean => File.Exists(path);

export const ensureDir = (path: string): void => {
  Directory.CreateDirectory(path);
};

export const readTextFile = (path: string): string => File.ReadAllText(path);

export const writeTextFile = (path: string, content: string): void => {
  const dir = Path.GetDirectoryName(path);
  if (dir !== undefined && dir !== "") {
    Directory.CreateDirectory(dir);
  }
  File.WriteAllText(path, content);
};

export const deleteDirRecursive = (path: string): void => {
  if (!Directory.Exists(path)) return;
  Directory.Delete(path, true);
};

export const listFilesRecursive = (rootDir: string, searchPattern: string): string[] => {
  if (!Directory.Exists(rootDir)) return [];
  return Directory.GetFiles(rootDir, searchPattern, SearchOption.AllDirectories);
};

export const copyDirRecursive = (srcDir: string, destDir: string): void => {
  if (!Directory.Exists(srcDir)) return;
  Directory.CreateDirectory(destDir);

  const files = Directory.GetFiles(srcDir, "*", SearchOption.AllDirectories);
  for (let i = 0; i < files.Length; i++) {
    const srcFile = files[i]!;
    const rel = Path.GetRelativePath(srcDir, srcFile);
    const destFile = Path.Combine(destDir, rel);
    const destFileDir = Path.GetDirectoryName(destFile);
    if (destFileDir !== undefined && destFileDir !== "") {
      Directory.CreateDirectory(destFileDir);
    }
    File.Copy(srcFile, destFile, true);
  }
};
