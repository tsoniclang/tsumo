import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { compareSitePaths } from "./site-routes.js";

const isBundleDirectory = (directory: string): boolean =>
  File.Exists(Path.Combine(directory, "index.md")) || File.Exists(Path.Combine(directory, "_index.md"));

export const copyBundleResources = (sourceDir: string, destinationDir: string): void => {
  if (!Directory.Exists(sourceDir)) return;
  Directory.CreateDirectory(destinationDir);

  const files = Array.from(Directory.GetFiles(sourceDir, "*", SearchOption.TopDirectoryOnly));
  files.sort((left: string, right: string) => compareSitePaths(left, right));
  for (let index = 0; index < files.length; index++) {
    const sourceFile = files[index]!;
    if (sourceFile.toLowerCase().endsWith(".md")) continue;
    const name = Path.GetFileName(sourceFile);
    if (name === undefined || name === "") continue;
    File.Copy(sourceFile, Path.Combine(destinationDir, name), true);
  }

  const directories = Array.from(Directory.GetDirectories(sourceDir, "*", SearchOption.TopDirectoryOnly));
  directories.sort((left: string, right: string) => compareSitePaths(left, right));
  for (let index = 0; index < directories.length; index++) {
    const child = directories[index]!;
    if (isBundleDirectory(child)) continue;
    if (Directory.GetFiles(child, "*.md", SearchOption.TopDirectoryOnly).length > 0) continue;
    const name = Path.GetFileName(child);
    if (name === undefined || name === "") continue;
    copyBundleResources(child, Path.Combine(destinationDir, name));
  }
};
