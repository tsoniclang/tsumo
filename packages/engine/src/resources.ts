import { Convert, Environment, Exception, Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, MemoryStream, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { Process, ProcessStartInfo } from "@tsonic/dotnet/System.Diagnostics.js";
import { SHA256 } from "@tsonic/dotnet/System.Security.Cryptography.js";
import { Encoding } from "@tsonic/dotnet/System.Text.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { byte, char, int } from "@tsonic/core/types.js";
import { replaceText } from "./utils/strings.ts";
import { MagicImageProcessor, ProcessImageSettings } from "photo-sauce-magic-scaler-types/PhotoSauce.MagicScaler.js";

export class ResourceData {
  readonly Integrity: string;

  constructor(integrity: string) {
    this.Integrity = integrity;
  }
}

export class ImageDimensions {
  readonly width: int;
  readonly height: int;

  constructor(width: int, height: int) {
    this.width = width;
    this.height = height;
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
  readonly mediaType: string;
  readonly width: int;
  readonly height: int;

  constructor(
    id: string,
    sourcePath: string | undefined,
    publishable: boolean,
    outputRelPath: string | undefined,
    bytes: byte[],
    text: string | undefined,
    data: ResourceData,
    mediaType: string = "",
    width: int = 0,
    height: int = 0,
  ) {
    this.id = id;
    this.sourcePath = sourcePath;
    this.publishable = publishable;
    this.outputRelPath = outputRelPath;
    this.bytes = bytes;
    this.text = text;
    this.Data = data;
    this.mediaType = mediaType;
    this.width = width;
    this.height = height;
  }

  /**
   * Parse PNG dimensions from file bytes.
   * PNG format: 8-byte signature, then IHDR chunk containing width/height at bytes 16-23.
   */
  static parsePngDimensions(bytes: byte[]): ImageDimensions | undefined {
    // PNG signature: 137 80 78 71 13 10 26 10
    if (bytes.Length < 24) return undefined;
    if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return undefined;

    // Width at bytes 16-19, Height at bytes 20-23 (big-endian)
    const width: int = (bytes[16]! << 24) | (bytes[17]! << 8 * 2) | (bytes[18]! << 8) | bytes[19]!;
    const height: int = (bytes[20]! << 24) | (bytes[21]! << 8 * 2) | (bytes[22]! << 8) | bytes[23]!;
    return new ImageDimensions(width, height);
  }

  /**
   * Parse JPEG dimensions from file bytes.
   * JPEG dimensions are in SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2).
   */
  static parseJpegDimensions(bytes: byte[]): ImageDimensions | undefined {
    if (bytes.Length < 2) return undefined;
    // JPEG signature: 0xFF 0xD8
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

    let i = 2;
    while (i < bytes.Length - 1) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }

      const marker = bytes[i + 1]!;
      // SOF0 (0xC0) or SOF2 (0xC2) contain dimensions
      if (marker === 0xc0 || marker === 0xc2) {
        if (i + 9 >= bytes.Length) return undefined;
        // Height at bytes i+5..i+6, Width at bytes i+7..i+8 (big-endian)
        const height: int = (bytes[i + 5]! << 8) | bytes[i + 6]!;
        const width: int = (bytes[i + 7]! << 8) | bytes[i + 8]!;
        return new ImageDimensions(width, height);
      }

      // Skip other markers
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
        i += 2;
        continue;
      }
      if (marker >= 0xd0 && marker <= 0xd7) {
        i += 2;
        continue;
      }

      // Other markers have length field
      if (i + 4 >= bytes.Length) return undefined;
      const len: int = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      i += 2 + len;
    }
    return undefined;
  }

  /**
   * Parse GIF dimensions from file bytes.
   * GIF dimensions are at bytes 6-9 (little-endian).
   */
  static parseGifDimensions(bytes: byte[]): ImageDimensions | undefined {
    if (bytes.Length < 10) return undefined;
    // GIF signature: "GIF87a" or "GIF89a"
    if (bytes[0] !== 71 || bytes[1] !== 73 || bytes[2] !== 70) return undefined;

    // Width at bytes 6-7, Height at bytes 8-9 (little-endian)
    const width: int = bytes[6]! | (bytes[7]! << 8);
    const height: int = bytes[8]! | (bytes[9]! << 8);
    return new ImageDimensions(width, height);
  }

  /**
   * Parse WebP dimensions from file bytes.
   */
  static parseWebpDimensions(bytes: byte[]): ImageDimensions | undefined {
    if (bytes.Length < 30) return undefined;
    // RIFF....WEBP signature
    if (bytes[0] !== 82 || bytes[1] !== 73 || bytes[2] !== 70 || bytes[3] !== 70) return undefined;
    if (bytes[8] !== 87 || bytes[9] !== 69 || bytes[10] !== 66 || bytes[11] !== 80) return undefined;

    // VP8 lossy format
    if (bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56 && bytes[15] === 32) {
      if (bytes.Length < 30) return undefined;
      // Dimensions at bytes 26-29 (little-endian, 14-bit each)
      const width: int = (bytes[26]! | (bytes[27]! << 8)) & 0x3fff;
      const height: int = (bytes[28]! | (bytes[29]! << 8)) & 0x3fff;
      return new ImageDimensions(width, height);
    }

    // VP8L lossless format
    if (bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56 && bytes[15] === 76) {
      if (bytes.Length < 25) return undefined;
      // Signature byte at 20, then 4 bytes with packed width/height
      const b0: int = bytes[21]!;
      const b1: int = bytes[22]!;
      const b2: int = bytes[23]!;
      const b3: int = bytes[24]!;
      const width: int = ((b0 | (b1 << 8)) & 0x3fff) + 1;
      const height: int = (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff) + 1;
      return new ImageDimensions(width, height);
    }

    return undefined;
  }

  /**
   * Try to parse image dimensions from bytes based on file signature.
   */
  static parseImageDimensions(bytes: byte[]): ImageDimensions | undefined {
    let dims = Resource.parsePngDimensions(bytes);
    if (dims !== undefined) return dims;

    dims = Resource.parseJpegDimensions(bytes);
    if (dims !== undefined) return dims;

    dims = Resource.parseGifDimensions(bytes);
    if (dims !== undefined) return dims;

    dims = Resource.parseWebpDimensions(bytes);
    if (dims !== undefined) return dims;

    return undefined;
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
    return path.Replace("\\", "/");
  }

  static normalizeRel(path: string): string {
    const slash: char = "/";
    const normalized = ResourceManager.normalizeSlashes(path.Trim());
    return normalized.TrimStart(slash);
  }

  private static toOsRelPath(relPath: string): string {
    const slash: char = "/";
    return relPath.Replace(slash, Path.DirectorySeparatorChar);
  }

  private static bytesToHex(hash: byte[]): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < hash.Length; i++) {
      const b = hash[i]!;
      const value: int = b;
      const hi = (value >> 4) & 0xf;
      const lo = value & 0xf;
      out += chars.Substring(hi, 1);
      out += chars.Substring(lo, 1);
    }
    return out;
  }

  /**
   * Get MIME type from file extension.
   */
  static getMediaType(ext: string): string {
    const e = ext.ToLowerInvariant();
    if (e === ".png") return "image/png";
    if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
    if (e === ".gif") return "image/gif";
    if (e === ".webp") return "image/webp";
    if (e === ".svg") return "image/svg+xml";
    if (e === ".ico") return "image/x-icon";
    if (e === ".bmp") return "image/bmp";
    if (e === ".tiff" || e === ".tif") return "image/tiff";
    if (e === ".js" || e === ".mjs") return "application/javascript";
    if (e === ".json") return "application/json";
    if (e === ".css") return "text/css";
    if (e === ".scss" || e === ".sass") return "text/x-scss";
    if (e === ".html" || e === ".htm") return "text/html";
    if (e === ".xml") return "application/xml";
    if (e === ".txt") return "text/plain";
    if (e === ".woff") return "font/woff";
    if (e === ".woff2") return "font/woff2";
    if (e === ".ttf") return "font/ttf";
    if (e === ".otf") return "font/otf";
    if (e === ".eot") return "application/vnd.ms-fontobject";
    if (e === ".pdf") return "application/pdf";
    if (e === ".zip") return "application/zip";
    return "application/octet-stream";
  }

  /**
   * Check if extension indicates an image type.
   */
  static isImageExtension(ext: string): boolean {
    const e = ext.ToLowerInvariant();
    return e === ".png" || e === ".jpg" || e === ".jpeg" || e === ".gif" || e === ".webp" || e === ".bmp";
  }

  private static splitDirAndFile(relPath: string): DirFileSplit {
    const slash: char = "/";
    const normalized = ResourceManager.normalizeRel(relPath);
    const idx = normalized.LastIndexOf(slash);
    if (idx < 0) return new DirFileSplit("", normalized);
    return new DirFileSplit(normalized.Substring(0, idx + 1), normalized.Substring(idx + 1));
  }

  private static splitFileBaseAndExt(fileName: string): FileBaseExtSplit {
    const idx = fileName.LastIndexOf(".");
    if (idx < 0) return new FileBaseExtSplit(fileName, "");
    return new FileBaseExtSplit(fileName.Substring(0, idx), fileName.Substring(idx));
  }

  private static segmentMatch(pattern: string, segment: string): boolean {
    if (pattern === "*") return true;
    const star = pattern.IndexOf("*");
    if (star < 0) return pattern === segment;

    const parts = pattern.Split("*");
    let pos = 0;
    for (let i = 0; i < parts.Length; i++) {
      const p = parts[i]!;
      if (p === "") continue;
      const idx = segment.IndexOf(p, pos);
      if (idx < 0) return false;
      if (i === 0 && !pattern.StartsWith("*") && idx !== 0) return false;
      pos = idx + p.Length;
    }
    if (!pattern.EndsWith("*") && pos !== segment.Length) return false;
    return true;
  }

  private static splitGlobSegments(raw: string): string[] {
    const normalized = ResourceManager.normalizeRel(raw);
    if (normalized === "") {
      const empty: string[] = [];
      return empty;
    }
    return normalized.Split("/");
  }

  private static globMatchAt(patSegs: string[], pathSegs: string[], pi: int, si: int): boolean {
    if (pi >= patSegs.Length) return si >= pathSegs.Length;
    const p = patSegs[pi]!;
    if (p === "**") {
      for (let i = si; i <= pathSegs.Length; i++) {
        if (ResourceManager.globMatchAt(patSegs, pathSegs, pi + 1, i)) return true;
      }
      return false;
    }
    if (si >= pathSegs.Length) return false;
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
    this.siteAssetsDir = Path.Combine(siteDir, "assets");
    this.themeAssetsDir = themeDir !== undefined ? Path.Combine(themeDir, "assets") : undefined;
    this.cache = new Dictionary<string, Resource>();
    const emptyFiles: string[] = [];
    this.siteAssetFiles = Directory.Exists(this.siteAssetsDir)
      ? Directory.GetFiles(this.siteAssetsDir, "*", SearchOption.AllDirectories)
      : emptyFiles;
    this.themeAssetFiles = this.themeAssetsDir !== undefined && Directory.Exists(this.themeAssetsDir)
      ? Directory.GetFiles(this.themeAssetsDir, "*", SearchOption.AllDirectories)
      : emptyFiles;
  }

  private resolveAssetFullPath(relPathRaw: string): string | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const osRel = ResourceManager.toOsRelPath(rel);
    const sitePath = Path.Combine(this.siteAssetsDir, osRel);
    if (File.Exists(sitePath)) return sitePath;
    if (this.themeAssetsDir !== undefined) {
      const themePath = Path.Combine(this.themeAssetsDir, osRel);
      if (File.Exists(themePath)) return themePath;
    }
    return undefined;
  }

  get(relPathRaw: string): Resource | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const key = `get:${rel}`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    const full = this.resolveAssetFullPath(rel);
    if (full === undefined) return undefined;

    const bytes = File.ReadAllBytes(full);
    const ext = (Path.GetExtension(full) ?? "").ToLowerInvariant();
    const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".svg" || ext === ".html" || ext === ".txt";
    const text = isText ? Encoding.UTF8.GetString(bytes) : undefined;
    const mediaType = ResourceManager.getMediaType(ext);

    // Parse image dimensions if applicable
    let width: int = 0;
    let height: int = 0;
    if (ResourceManager.isImageExtension(ext)) {
      const dims = Resource.parseImageDimensions(bytes);
      if (dims !== undefined) {
        width = dims.width;
        height = dims.height;
      }
    }

    const res = new Resource(key, full, true, rel, bytes, text, new ResourceData(""), mediaType, width, height);
    this.cache.Add(key, res);
    return res;
  }

  getMatch(pattern: string): Resource | undefined {
    const pat = pattern.Trim();
    if (pat === "") return undefined;
    if (!pat.Contains("*")) return this.get(pat);

    for (let i = 0; i < this.siteAssetFiles.Length; i++) {
      const full = this.siteAssetFiles[i]!;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      if (!ResourceManager.globMatch(pat, rel)) continue;
      return this.get(rel);
    }

    if (this.themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.Length; i++) {
        const full = this.themeAssetFiles[i]!;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.themeAssetsDir, full));
        if (!ResourceManager.globMatch(pat, rel)) continue;
        return this.get(rel);
      }
    }

    return undefined;
  }

  /**
   * Match all resources matching a glob pattern. Returns array sorted by path.
   */
  match(pattern: string): Resource[] {
    const pat = pattern.Trim();
    const result = new List<Resource>();
    if (pat === "") return result.ToArray();

    // Track paths already added (site assets take priority over theme)
    const added = new Dictionary<string, boolean>();

    // Search site assets first
    for (let i = 0; i < this.siteAssetFiles.Length; i++) {
      const full = this.siteAssetFiles[i]!;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      if (!ResourceManager.globMatch(pat, rel)) continue;
      const res = this.get(rel);
      if (res !== undefined) {
        result.Add(res);
        added.Add(rel, true);
      }
    }

    // Search theme assets
    if (this.themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.Length; i++) {
        const full = this.themeAssetFiles[i]!;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.themeAssetsDir, full));
        if (!ResourceManager.globMatch(pat, rel)) continue;
        // Skip if site already has this path
        let exists = false;
        if (added.TryGetValue(rel, exists)) continue;
        const res = this.get(rel);
        if (res !== undefined) result.Add(res);
      }
    }

    return result.ToArray();
  }

  /**
   * Get all resources of a given media type (e.g., "image", "text").
   */
  byType(mediaType: string): Resource[] {
    const targetType = mediaType.Trim().ToLowerInvariant();
    const result = new List<Resource>();
    const added = new Dictionary<string, boolean>();

    const matchesType = (path: string): boolean => {
      const ext = (Path.GetExtension(path) ?? "").ToLowerInvariant();
      if (targetType === "image") {
        return ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp" || ext === ".svg" || ext === ".ico";
      }
      if (targetType === "text") {
        return ext === ".css" || ext === ".js" || ext === ".json" || ext === ".html" || ext === ".txt" || ext === ".xml" || ext === ".svg";
      }
      if (targetType === "application") {
        return ext === ".js" || ext === ".json" || ext === ".woff" || ext === ".woff2" || ext === ".ttf" || ext === ".eot";
      }
      return false;
    };

    // Search site assets
    for (let i = 0; i < this.siteAssetFiles.Length; i++) {
      const full = this.siteAssetFiles[i]!;
      if (!matchesType(full)) continue;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      const res = this.get(rel);
      if (res !== undefined) {
        result.Add(res);
        added.Add(rel, true);
      }
    }

    // Search theme assets
    if (this.themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.Length; i++) {
        const full = this.themeAssetFiles[i]!;
        if (!matchesType(full)) continue;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.themeAssetsDir, full));
        let exists = false;
        if (added.TryGetValue(rel, exists)) continue;
        const res = this.get(rel);
        if (res !== undefined) result.Add(res);
      }
    }

    return result.ToArray();
  }

  /**
   * Concatenate multiple resources into one. Text is joined with newlines.
   */
  concat(targetPath: string, resources: Resource[]): Resource {
    const target = ResourceManager.normalizeRel(targetPath);
    const keySb = new StringBuilder();
    keySb.Append("concat:");
    keySb.Append(target);
    for (let i = 0; i < resources.Length; i++) keySb.Append("|" + resources[i]!.id);
    const key = keySb.ToString();

    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    const sb = new StringBuilder();
    for (let i = 0; i < resources.Length; i++) {
      const res = resources[i]!;
      if (res.text !== undefined) {
        if (sb.Length > 0) sb.Append("\n");
        sb.Append(res.text);
      }
    }
    const text = sb.ToString();
    const bytes = Encoding.UTF8.GetBytes(text);

    const result = new Resource(key, undefined, true, target, bytes, text, new ResourceData(""));
    this.cache.Add(key, result);
    return result;
  }

  fromString(nameRaw: string, content: string): Resource {
    const name = nameRaw.Trim();
    const key = `fromString:${name}`;
    const bytes = Encoding.UTF8.GetBytes(content);
    return new Resource(key, undefined, false, undefined, bytes, content, new ResourceData(""));
  }

  ensurePublished(resource: Resource): void {
    if (!resource.publishable) return;
    if (resource.outputRelPath === undefined) return;

    const rel = ResourceManager.normalizeRel(resource.outputRelPath);
    if (rel === "") return;
    const dest = Path.Combine(this.outputDir, ResourceManager.toOsRelPath(rel));
    const dir = Path.GetDirectoryName(dest);
    if (dir !== undefined && dir !== "") Directory.CreateDirectory(dir);
    File.WriteAllBytes(dest, resource.bytes);
  }

  minify(resource: Resource): Resource {
    const key = `${resource.id}|minify`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    if (resource.text === undefined) {
      const copy = new Resource(key, resource.sourcePath, resource.publishable, resource.outputRelPath, resource.bytes, undefined, resource.Data);
      this.cache.Add(key, copy);
      return copy;
    }

    const lines = resource.text.ReplaceLineEndings("\n").Split("\n");
    const sb = new StringBuilder();
    for (let i = 0; i < lines.Length; i++) {
      const trimmed = lines[i]!.Trim();
      if (trimmed === "") continue;
      if (sb.Length > 0) sb.Append("\n");
      sb.Append(trimmed);
    }
    const minified = sb.ToString();
    const bytes = Encoding.UTF8.GetBytes(minified);

    const outPath = resource.outputRelPath;
    const updated = new Resource(key, resource.sourcePath, resource.publishable, outPath, bytes, minified, resource.Data);
    this.cache.Add(key, updated);
    return updated;
  }

  fingerprint(resource: Resource): Resource {
    const key = `${resource.id}|fingerprint`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    const hash = SHA256.HashData(resource.bytes);
    const integrity = `sha256-${Convert.ToBase64String(hash)}`;
    const shortHex = ResourceManager.bytesToHex(hash).Substring(0, 16);

    const outRel = resource.outputRelPath;
    const outPath = outRel !== undefined ? ResourceManager.normalizeRel(outRel) : "";
    const split = ResourceManager.splitDirAndFile(outPath);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const hashedFile = fileSplit.ext === "" ? `${fileSplit.base}.${shortHex}` : `${fileSplit.base}.${shortHex}${fileSplit.ext}`;
    const hashedPath = split.dir + hashedFile;

    const updated = new Resource(key, resource.sourcePath, resource.publishable, hashedPath, resource.bytes, resource.text, new ResourceData(integrity));
    this.cache.Add(key, updated);
    return updated;
  }

  /**
   * Copy a resource to a new output path.
   * In Hugo: resources.Copy "targetPath" $resource
   */
  copy(targetPath: string, resource: Resource): Resource {
    const normalizedTarget = ResourceManager.normalizeRel(targetPath);
    const key = `${resource.id}|copy:${normalizedTarget}`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    const updated = new Resource(key, resource.sourcePath, resource.publishable, normalizedTarget, resource.bytes, resource.text, resource.Data, resource.mediaType, resource.width, resource.height);
    this.cache.Add(key, updated);
    return updated;
  }

  /**
   * Mark a resource for post-processing.
   * In Hugo this is used for deferred fingerprinting of CSS with PostCSS.
   * Since we don't have deferred processing, this just returns the resource as-is.
   */
  postProcess(resource: Resource): Resource {
    // In our implementation, postProcess is essentially a no-op since
    // we don't have Hugo's deferred processing pipeline.
    // Just return the resource unchanged.
    return resource;
  }

  sassCompile(resource: Resource): Resource {
    const key = `${resource.id}|sass`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    if (resource.text === undefined) throw new Exception("css.Sass expects a text resource");

    const sassExeRaw = Environment.GetEnvironmentVariable("TSUMO_SASS");
    const sassExe = sassExeRaw !== undefined && sassExeRaw.Trim() !== "" ? sassExeRaw.Trim() : "sass";

    const tmpDir = Path.Combine(this.outputDir, ".tsumo", "sass");
    Directory.CreateDirectory(tmpDir);

    const inputPath = Path.Combine(tmpDir, "input.scss");
    const outputPath = Path.Combine(tmpDir, "output.css");
    File.WriteAllText(inputPath, resource.text);

    const args = new List<string>();
    args.Add("--no-source-map");
    args.Add("--style");
    args.Add("expanded");
    if (Directory.Exists(this.siteAssetsDir)) {
      args.Add("--load-path");
      args.Add(this.siteAssetsDir);
    }
    if (this.themeAssetsDir !== undefined && Directory.Exists(this.themeAssetsDir)) {
      args.Add("--load-path");
      args.Add(this.themeAssetsDir);
    }
    args.Add(inputPath);
    args.Add(outputPath);

    const startInfo = new ProcessStartInfo();
    startInfo.FileName = sassExe;
    const argsText = new StringBuilder();
    const argsArr = args.ToArray();
    const quoteArg = (arg: string): string => {
      const trimmed = arg.Trim();
      if (trimmed === "") return trimmed;
      if (!trimmed.Contains(" ") && !trimmed.Contains("\"")) return trimmed;
      return "\"" + replaceText(trimmed, "\"", "\\\"") + "\"";
    };
    for (let i = 0; i < argsArr.Length; i++) {
      if (i > 0) argsText.Append(" ");
      argsText.Append(quoteArg(argsArr[i]!));
    }
    startInfo.Arguments = argsText.ToString();
    startInfo.RedirectStandardOutput = true;
    startInfo.RedirectStandardError = true;
    startInfo.UseShellExecute = false;
    startInfo.CreateNoWindow = true;

    let process: Process | undefined = undefined;
    try {
      process = Process.Start(startInfo);
    } catch (e) {
      throw new Exception(
        `Failed to start Sass compiler '${sassExe}'. Install Dart Sass (the \`sass\` CLI) or set TSUMO_SASS to the full path of a Sass executable. Details: ${e}`,
      );
    }
    if (process === undefined) throw new Exception("Failed to start Sass compiler");
    process.WaitForExit();
    if (process.ExitCode !== 0) {
      const err = process.StandardError.ReadToEnd() ?? "";
      throw new Exception(err.Trim() === "" ? `Sass compiler failed (exit ${process.ExitCode})` : err);
    }

    if (!File.Exists(outputPath)) throw new Exception("Sass compiler did not produce output");
    const cssText = File.ReadAllText(outputPath);
    const cssBytes = Encoding.UTF8.GetBytes(cssText);

    const outRel = resource.outputRelPath ?? "style.scss";
    const split = ResourceManager.splitDirAndFile(outRel);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const cssFile = fileSplit.base + ".css";
    const cssRel = split.dir + cssFile;

    const updated = new Resource(key, resource.sourcePath, true, cssRel, cssBytes, cssText, resource.Data);
    this.cache.Add(key, updated);
    return updated;
  }

  /**
   * Parse Hugo-style resize spec (e.g., "300x200", "300x", "x200").
   * Returns dimensions where 0 means "auto".
   */
  private static tryParseInt(s: string): int {
    if (s === "") return 0;
    let result: int = 0;
    if (Int32.TryParse(s, result)) return result;
    return 0;
  }

  private static parseResizeWidth(spec: string): int {
    const s = spec.Trim().ToLowerInvariant();
    const xIdx = s.IndexOf("x");
    if (xIdx < 0) {
      // Just a number - interpret as width
      return ResourceManager.tryParseInt(s);
    }
    const wPart = s.Substring(0, xIdx).Trim();
    return ResourceManager.tryParseInt(wPart);
  }

  private static parseResizeHeight(spec: string): int {
    const s = spec.Trim().ToLowerInvariant();
    const xIdx = s.IndexOf("x");
    if (xIdx < 0) {
      return 0;
    }
    const hPart = s.Substring(xIdx + 1);
    // Extract just the numeric part (handle things like "300x200 webp q80")
    const hStr = hPart.Split(" ")[0]!.Trim();
    return ResourceManager.tryParseInt(hStr);
  }

  /**
   * Get output format from resize spec (e.g., "300x200 webp" -> "webp").
   * Returns undefined if no format specified.
   */
  private static parseResizeFormat(spec: string): string | undefined {
    const s = spec.Trim().ToLowerInvariant();
    const parts = s.Split(" ");
    for (let i = 1; i < parts.Length; i++) {
      const p = parts[i]!.Trim();
      if (p === "jpg" || p === "jpeg" || p === "png" || p === "gif" || p === "webp") {
        return p === "jpeg" ? "jpg" : p;
      }
    }
    return undefined;
  }

  /**
   * Resize an image resource using MagicScaler.
   * Spec format: "WIDTHxHEIGHT [format] [options]"
   * Examples: "300x200", "300x", "x200", "300x200 webp"
   */
  resize(resource: Resource, spec: string): Resource {
    const targetW = ResourceManager.parseResizeWidth(spec);
    const targetH = ResourceManager.parseResizeHeight(spec);
    const outFormat = ResourceManager.parseResizeFormat(spec);

    // Build cache key
    const key = `${resource.id}|resize:${spec}`;
    const emptyBytes: byte[] = [];
    let cached = new Resource("", undefined, false, undefined, emptyBytes, undefined, new ResourceData(""));
    if (this.cache.TryGetValue(key, cached)) return cached;

    // Need source path to process
    if (resource.sourcePath === undefined) {
      throw new Exception("Cannot resize resource without source path");
    }

    // Determine output extension
    const srcExt = (Path.GetExtension(resource.sourcePath) ?? "").ToLowerInvariant();
    const outExt = outFormat !== undefined ? `.${outFormat}` : srcExt;

    // Calculate dimensions - if one is 0, compute proportionally
    let width: int = targetW;
    let height: int = targetH;

    if (width === 0 && height === 0) {
      // No resize needed, return original
      return resource;
    }

    if (width === 0 && resource.width > 0 && resource.height > 0) {
      // Calculate width from height maintaining aspect ratio
      width = (resource.width * height) / resource.height;
    } else if (height === 0 && resource.width > 0 && resource.height > 0) {
      // Calculate height from width maintaining aspect ratio
      height = (resource.height * width) / resource.width;
    }

    // Create output path in temp directory
    const tmpDir = Path.Combine(this.outputDir, ".tsumo", "resize");
    Directory.CreateDirectory(tmpDir);
    const tmpOut = Path.Combine(tmpDir, `${Path.GetFileNameWithoutExtension(resource.sourcePath)}_${width}x${height}${outExt}`);

    // Configure MagicScaler settings
    const settings = new ProcessImageSettings();
    settings.Width = width;
    settings.Height = height;

    // Set output format if needed
    if (outFormat !== undefined) {
      settings.TrySetEncoderFormat(outExt);
    }

    // Process the image
    MagicImageProcessor.ProcessImage(resource.sourcePath, tmpOut, settings);

    // Read processed image
    const bytes = File.ReadAllBytes(tmpOut);

    // Parse dimensions of output
    let outWidth: int = width;
    let outHeight: int = height;
    const dims = Resource.parseImageDimensions(bytes);
    if (dims !== undefined) {
      outWidth = dims.width;
      outHeight = dims.height;
    }

    // Build output relative path
    const outRel = resource.outputRelPath ?? "";
    const split = ResourceManager.splitDirAndFile(outRel);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const resizedFile = `${fileSplit.base}_${outWidth}x${outHeight}${outExt}`;
    const resizedRel = split.dir + resizedFile;

    const mediaType = ResourceManager.getMediaType(outExt);
    const result = new Resource(key, tmpOut, true, resizedRel, bytes, undefined, new ResourceData(""), mediaType, outWidth, outHeight);
    this.cache.Add(key, result);
    return result;
  }
}
