import { Convert, Environment, Exception } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { Process, ProcessStartInfo } from "@tsonic/dotnet/System.Diagnostics.js";
import { SHA256 } from "@tsonic/dotnet/System.Security.Cryptography.js";
import { Encoding } from "@tsonic/dotnet/System.Text.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { byte, char, int } from "@tsonic/core/types.js";
import { replaceText } from "./utils/strings.ts";

export class ResourceData {
  readonly Integrity: string;

  constructor(integrity: string) {
    this.Integrity = integrity;
  }
}

export class Resource {
  readonly id: string;
  readonly sourcePath: string | undefined;
  readonly publishable: boolean;
  readonly outputRelPath: string | undefined;
  readonly bytes: byte[];
  readonly text: string | undefined;
  readonly Data: ResourceData;

  constructor(
    id: string,
    sourcePath: string | undefined,
    publishable: boolean,
    outputRelPath: string | undefined,
    bytes: byte[],
    text: string | undefined,
    data: ResourceData,
  ) {
    this.id = id;
    this.sourcePath = sourcePath;
    this.publishable = publishable;
    this.outputRelPath = outputRelPath;
    this.bytes = bytes;
    this.text = text;
    this.Data = data;
  }
}

class DirFileSplit {
  readonly dir: string;
  readonly file: string;

  constructor(dir: string, file: string) {
    this.dir = dir;
    this.file = file;
  }
}

class FileBaseExtSplit {
  readonly base: string;
  readonly ext: string;

  constructor(base: string, ext: string) {
    this.base = base;
    this.ext = ext;
  }
}

export class ResourceManager {
  private readonly siteDir: string;
  private readonly themeDir: string | undefined;
  private readonly outputDir: string;

  private readonly siteAssetsDir: string;
  private readonly themeAssetsDir: string | undefined;

  private readonly cache: Dictionary<string, Resource>;
  private readonly siteAssetFiles: string[];
  private readonly themeAssetFiles: string[];

  private static normalizeSlashes(path: string): string {
    return path.replace("\\", "/");
  }

  static normalizeRel(path: string): string {
    const slash: char = "/";
    const normalized = ResourceManager.normalizeSlashes(path.trim());
    return normalized.trimStart(slash);
  }

  private static toOsRelPath(relPath: string): string {
    const slash: char = "/";
    return relPath.replace(slash, Path.directorySeparatorChar);
  }

  private static bytesToHex(hash: byte[]): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < hash.length; i++) {
      const b = hash[i]!;
      const value: int = b;
      const hi = (value >> 4) & 0xf;
      const lo = value & 0xf;
      out += chars.substring(hi, hi + 1);
      out += chars.substring(lo, lo + 1);
    }
    return out;
  }

  private static splitDirAndFile(relPath: string): DirFileSplit {
    const slash: char = "/";
    const normalized = ResourceManager.normalizeRel(relPath);
    const idx = normalized.lastIndexOf(slash);
    if (idx < 0) return new DirFileSplit("", normalized);
    return new DirFileSplit(normalized.substring(0, idx + 1), normalized.substring(idx + 1));
  }

  private static splitFileBaseAndExt(fileName: string): FileBaseExtSplit {
    const idx = fileName.lastIndexOf(".");
    if (idx < 0) return new FileBaseExtSplit(fileName, "");
    return new FileBaseExtSplit(fileName.substring(0, idx), fileName.substring(idx));
  }

  private static segmentMatch(pattern: string, segment: string): boolean {
    if (pattern === "*") return true;
    const star = pattern.indexOf("*");
    if (star < 0) return pattern === segment;

    const parts = pattern.split("*");
    let pos = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (p === "") continue;
      const idx = segment.indexOf(p, pos);
      if (idx < 0) return false;
      if (i === 0 && !pattern.startsWith("*") && idx !== 0) return false;
      pos = idx + p.length;
    }
    if (!pattern.endsWith("*") && pos !== segment.length) return false;
    return true;
  }

  private static splitGlobSegments(raw: string): string[] {
    const normalized = ResourceManager.normalizeRel(raw);
    if (normalized === "") {
      const empty: string[] = [];
      return empty;
    }
    return normalized.split("/");
  }

  private static globMatchAt(patSegs: string[], pathSegs: string[], pi: int, si: int): boolean {
    if (pi >= patSegs.length) return si >= pathSegs.length;
    const p = patSegs[pi]!;
    if (p === "**") {
      for (let i = si; i <= pathSegs.length; i++) {
        if (ResourceManager.globMatchAt(patSegs, pathSegs, pi + 1, i)) return true;
      }
      return false;
    }
    if (si >= pathSegs.length) return false;
    if (!ResourceManager.segmentMatch(p, pathSegs[si]!)) return false;
    return ResourceManager.globMatchAt(patSegs, pathSegs, pi + 1, si + 1);
  }

  private static globMatch(patternRaw: string, pathRaw: string): boolean {
    const patSegs = ResourceManager.splitGlobSegments(patternRaw);
    const pathSegs = ResourceManager.splitGlobSegments(pathRaw);
    return ResourceManager.globMatchAt(patSegs, pathSegs, 0, 0);
  }

  constructor(siteDir: string, themeDir: string | undefined, outputDir: string) {
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.siteAssetsDir = Path.combine(siteDir, "assets");
    this.themeAssetsDir = themeDir !== undefined ? Path.combine(themeDir, "assets") : undefined;
    this.cache = new Dictionary<string, Resource>();
    const emptyFiles: string[] = [];
    this.siteAssetFiles = Directory.exists(this.siteAssetsDir)
      ? Directory.getFiles(this.siteAssetsDir, "*", SearchOption.allDirectories)
      : emptyFiles;
    this.themeAssetFiles = this.themeAssetsDir !== undefined && Directory.exists(this.themeAssetsDir)
      ? Directory.getFiles(this.themeAssetsDir, "*", SearchOption.allDirectories)
      : emptyFiles;
  }

  private resolveAssetFullPath(relPathRaw: string): string | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const osRel = ResourceManager.toOsRelPath(rel);
    const sitePath = Path.combine(this.siteAssetsDir, osRel);
    if (File.exists(sitePath)) return sitePath;
    if (this.themeAssetsDir !== undefined) {
      const themePath = Path.combine(this.themeAssetsDir, osRel);
      if (File.exists(themePath)) return themePath;
    }
    return undefined;
  }

  get(relPathRaw: string): Resource | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const key = `get:${rel}`;
    const emptyBytes: byte[] = [];
    const cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.tryGetValue(key, cached)) return cached;

    const full = this.resolveAssetFullPath(rel);
    if (full === undefined) return undefined;

    const bytes = File.readAllBytes(full);
    const ext = (Path.getExtension(full) ?? "").toLowerInvariant();
    const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".svg" || ext === ".html" || ext === ".txt";
    const text = isText ? Encoding.UTF8.getString(bytes) : undefined;
    const res = new Resource(key, full, true, rel, bytes, text, new ResourceData(""));
    this.cache.add(key, res);
    return res;
  }

  getMatch(pattern: string): Resource | undefined {
    const pat = pattern.trim();
    if (pat === "") return undefined;
    if (!pat.contains("*")) return this.get(pat);

    for (let i = 0; i < this.siteAssetFiles.length; i++) {
      const full = this.siteAssetFiles[i]!;
      const rel = ResourceManager.normalizeSlashes(Path.getRelativePath(this.siteAssetsDir, full));
      if (!ResourceManager.globMatch(pat, rel)) continue;
      return this.get(rel);
    }

    if (this.themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.length; i++) {
        const full = this.themeAssetFiles[i]!;
        const rel = ResourceManager.normalizeSlashes(Path.getRelativePath(this.themeAssetsDir, full));
        if (!ResourceManager.globMatch(pat, rel)) continue;
        return this.get(rel);
      }
    }

    return undefined;
  }

  fromString(nameRaw: string, content: string): Resource {
    const name = nameRaw.trim();
    const key = `fromString:${name}`;
    const bytes = Encoding.UTF8.getBytes(content);
    return new Resource(key, undefined, false, undefined, bytes, content, new ResourceData(""));
  }

  ensurePublished(resource: Resource): void {
    if (!resource.publishable) return;
    if (resource.outputRelPath === undefined) return;

    const rel = ResourceManager.normalizeRel(resource.outputRelPath);
    if (rel === "") return;
    const dest = Path.combine(this.outputDir, ResourceManager.toOsRelPath(rel));
    const dir = Path.getDirectoryName(dest);
    if (dir !== undefined && dir !== "") Directory.createDirectory(dir);
    File.writeAllBytes(dest, resource.bytes);
  }

  minify(resource: Resource): Resource {
    const key = `${resource.id}|minify`;
    const emptyBytes: byte[] = [];
    const cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.tryGetValue(key, cached)) return cached;

    if (resource.text === undefined) {
      const copy = new Resource(key, resource.sourcePath, resource.publishable, resource.outputRelPath, resource.bytes, undefined, resource.Data);
      this.cache.add(key, copy);
      return copy;
    }

    const lines = resource.text.replaceLineEndings("\n").split("\n");
    const sb = new StringBuilder();
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed === "") continue;
      if (sb.length > 0) sb.append("\n");
      sb.append(trimmed);
    }
    const minified = sb.toString();
    const bytes = Encoding.UTF8.getBytes(minified);

    const outPath = resource.outputRelPath;
    const updated = new Resource(key, resource.sourcePath, resource.publishable, outPath, bytes, minified, resource.Data);
    this.cache.add(key, updated);
    return updated;
  }

  fingerprint(resource: Resource): Resource {
    const key = `${resource.id}|fingerprint`;
    const emptyBytes: byte[] = [];
    const cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.tryGetValue(key, cached)) return cached;

    const hash = SHA256.hashData(resource.bytes);
    const integrity = `sha256-${Convert.toBase64String(hash)}`;
    const shortHex = ResourceManager.bytesToHex(hash).substring(0, 16);

    const outRel = resource.outputRelPath;
    const outPath = outRel !== undefined ? ResourceManager.normalizeRel(outRel) : "";
    const split = ResourceManager.splitDirAndFile(outPath);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const hashedFile = fileSplit.ext === "" ? `${fileSplit.base}.${shortHex}` : `${fileSplit.base}.${shortHex}${fileSplit.ext}`;
    const hashedPath = split.dir + hashedFile;

    const updated = new Resource(key, resource.sourcePath, resource.publishable, hashedPath, resource.bytes, resource.text, new ResourceData(integrity));
    this.cache.add(key, updated);
    return updated;
  }

  sassCompile(resource: Resource): Resource {
    const key = `${resource.id}|sass`;
    const emptyBytes: byte[] = [];
    const cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.tryGetValue(key, cached)) return cached;

    if (resource.text === undefined) throw new Exception("css.Sass expects a text resource");

    const sassExeRaw = Environment.getEnvironmentVariable("TSUMO_SASS");
    const sassExe = sassExeRaw !== undefined && sassExeRaw.trim() !== "" ? sassExeRaw.trim() : "sass";

    const tmpDir = Path.combine(this.outputDir, ".tsumo", "sass");
    Directory.createDirectory(tmpDir);

    const inputPath = Path.combine(tmpDir, "input.scss");
    const outputPath = Path.combine(tmpDir, "output.css");
    File.writeAllText(inputPath, resource.text);

    const args = new List<string>();
    args.add("--no-source-map");
    args.add("--style");
    args.add("expanded");
    if (Directory.exists(this.siteAssetsDir)) {
      args.add("--load-path");
      args.add(this.siteAssetsDir);
    }
    if (this.themeAssetsDir !== undefined && Directory.exists(this.themeAssetsDir)) {
      args.add("--load-path");
      args.add(this.themeAssetsDir);
    }
    args.add(inputPath);
    args.add(outputPath);

    const startInfo = new ProcessStartInfo();
    startInfo.fileName = sassExe;
    const argsText = new StringBuilder();
    const argsArr = args.toArray();
    const quoteArg = (arg: string): string => {
      const trimmed = arg.trim();
      if (trimmed === "") return trimmed;
      if (!trimmed.contains(" ") && !trimmed.contains("\"")) return trimmed;
      return "\"" + replaceText(trimmed, "\"", "\\\"") + "\"";
    };
    for (let i = 0; i < argsArr.length; i++) {
      if (i > 0) argsText.append(" ");
      argsText.append(quoteArg(argsArr[i]!));
    }
    startInfo.arguments = argsText.toString();
    startInfo.redirectStandardOutput = true;
    startInfo.redirectStandardError = true;
    startInfo.useShellExecute = false;
    startInfo.createNoWindow = true;

    const process = Process.start(startInfo);
    if (process === undefined) throw new Exception("Failed to start Sass compiler");
    process.waitForExit();
    if (process.exitCode !== 0) {
      const err = process.standardError.readToEnd() ?? "";
      throw new Exception(err.trim() === "" ? `Sass compiler failed (exit ${process.exitCode})` : err);
    }

    if (!File.exists(outputPath)) throw new Exception("Sass compiler did not produce output");
    const cssText = File.readAllText(outputPath);
    const cssBytes = Encoding.UTF8.getBytes(cssText);

    const outRel = resource.outputRelPath ?? "style.scss";
    const split = ResourceManager.splitDirAndFile(outRel);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const cssFile = fileSplit.base + ".css";
    const cssRel = split.dir + cssFile;

    const updated = new Resource(key, resource.sourcePath, true, cssRel, cssBytes, cssText, resource.Data);
    this.cache.add(key, updated);
    return updated;
  }
}
