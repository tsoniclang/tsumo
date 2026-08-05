import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Environment, Exception } from "@tsonic/dotnet/System.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { Process, ProcessStartInfo } from "@tsonic/dotnet/System.Diagnostics.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/csharp/types.js";
import { parseInt32 } from "./utils/int32.js";
import { replaceLineEndings, replaceText, substringCount, substringFrom, trimStartChar } from "./utils/strings.js";
import { CodecManager, MagicImageProcessor, ProcessImageSettings } from "@tsonic/dotnet/PhotoSauce.MagicScaler.js";
import type { CodecCollection } from "@tsonic/dotnet/PhotoSauce.MagicScaler.js";
import { CodecCollectionExtensions as GiflibCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Giflib.js";
import { CodecCollectionExtensions as LibjpegCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libjpeg.js";
import { CodecCollectionExtensions as LibpngCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libpng.js";
import { WebpCodec } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libwebp.js";

// MagicScaler ships no codecs on Linux; register the pinned native codecs
// once before the first image operation.
let imageCodecsRegistered = false;

const ensureImageCodecsRegistered = (): void => {
  if (imageCodecsRegistered) return;
  imageCodecsRegistered = true;
  CodecManager.Configure((codecs: CodecCollection) => {
    LibpngCodecs.UseLibpng(codecs, true);
    LibjpegCodecs.UseLibjpeg(codecs, true);
    GiflibCodecs.UseGiflib(codecs, true);
    WebpCodec.UseLibwebp(codecs, true);
  });
};

const shift2: int = 2;
const shift6: int = 6;
const shift8: int = 8;
const shift10: int = 10;
const shift16: int = 16;
const shift24: int = 24;

export class ResourceData {
  Integrity: string;

  constructor(integrity: string) {
    this.Integrity = integrity;
  }
}

export class ImageDimensions {
  width: int;
  height: int;

  constructor(width: int, height: int) {
    this.width = width;
    this.height = height;
  }
}

export class Resource {
  id: string;
  sourcePath: string | undefined;
  publishable: boolean;
  outputRelPath: string | undefined;
  bytes: Buffer;
  text: string | undefined;
  Data: ResourceData;
  mediaType: string;
  width: int;
  height: int;

  constructor(
    id: string,
    sourcePath: string | undefined,
    publishable: boolean,
    outputRelPath: string | undefined,
    bytes: Buffer,
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
  static parsePngDimensions(bytes: Buffer): ImageDimensions | undefined {
    // PNG signature: 137 80 78 71 13 10 26 10
    if (bytes.length < 24) return undefined;
    if (bytes.readUInt8(0) !== 137 || bytes.readUInt8(1) !== 80 || bytes.readUInt8(2) !== 78 || bytes.readUInt8(3) !== 71) return undefined;

    // Width at bytes 16-19, Height at bytes 20-23 (big-endian)
    const w0: int = bytes.readUInt8(16);
    const w1: int = bytes.readUInt8(17);
    const w2: int = bytes.readUInt8(18);
    const w3: int = bytes.readUInt8(19);
    const h0: int = bytes.readUInt8(20);
    const h1: int = bytes.readUInt8(21);
    const h2: int = bytes.readUInt8(22);
    const h3: int = bytes.readUInt8(23);
    const width: int = (w0 << shift24) | (w1 << shift16) | (w2 << shift8) | w3;
    const height: int = (h0 << shift24) | (h1 << shift16) | (h2 << shift8) | h3;
    return new ImageDimensions(width, height);
  }

  /**
   * Parse JPEG dimensions from file bytes.
   * JPEG dimensions are in SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2).
   */
  static parseJpegDimensions(bytes: Buffer): ImageDimensions | undefined {
    if (bytes.length < 2) return undefined;
    // JPEG signature: 0xFF 0xD8
    if (bytes.readUInt8(0) !== 0xff || bytes.readUInt8(1) !== 0xd8) return undefined;

    let i = 2;
    while (i < bytes.length - 1) {
      if (bytes.readUInt8(i) !== 0xff) {
        i++;
        continue;
      }

      const marker = bytes.readUInt8(i + 1);
      // SOF0 (0xC0) or SOF2 (0xC2) contain dimensions
      if (marker === 0xc0 || marker === 0xc2) {
        if (i + 9 >= bytes.length) return undefined;
        // Height at bytes i+5..i+6, Width at bytes i+7..i+8 (big-endian)
        const h0: int = bytes.readUInt8(i + 5);
        const h1: int = bytes.readUInt8(i + 6);
        const w0: int = bytes.readUInt8(i + 7);
        const w1: int = bytes.readUInt8(i + 8);
        const height: int = (h0 << shift8) | h1;
        const width: int = (w0 << shift8) | w1;
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
      if (i + 4 >= bytes.length) return undefined;
      const l0: int = bytes.readUInt8(i + 2);
      const l1: int = bytes.readUInt8(i + 3);
      const len: int = (l0 << shift8) | l1;
      i += 2 + len;
    }
    return undefined;
  }

  /**
   * Parse GIF dimensions from file bytes.
   * GIF dimensions are at bytes 6-9 (little-endian).
   */
  static parseGifDimensions(bytes: Buffer): ImageDimensions | undefined {
    if (bytes.length < 10) return undefined;
    // GIF signature: "GIF87a" or "GIF89a"
    if (bytes.readUInt8(0) !== 71 || bytes.readUInt8(1) !== 73 || bytes.readUInt8(2) !== 70) return undefined;

    // Width at bytes 6-7, Height at bytes 8-9 (little-endian)
    const w0: int = bytes.readUInt8(6);
    const w1: int = bytes.readUInt8(7);
    const h0: int = bytes.readUInt8(8);
    const h1: int = bytes.readUInt8(9);
    const width: int = w0 | (w1 << shift8);
    const height: int = h0 | (h1 << shift8);
    return new ImageDimensions(width, height);
  }

  /**
   * Parse WebP dimensions from file bytes.
   */
  static parseWebpDimensions(bytes: Buffer): ImageDimensions | undefined {
    if (bytes.length < 30) return undefined;
    // RIFF....WEBP signature
    if (bytes.readUInt8(0) !== 82 || bytes.readUInt8(1) !== 73 || bytes.readUInt8(2) !== 70 || bytes.readUInt8(3) !== 70) return undefined;
    if (bytes.readUInt8(8) !== 87 || bytes.readUInt8(9) !== 69 || bytes.readUInt8(10) !== 66 || bytes.readUInt8(11) !== 80) return undefined;

    // VP8 lossy format
    if (bytes.readUInt8(12) === 86 && bytes.readUInt8(13) === 80 && bytes.readUInt8(14) === 56 && bytes.readUInt8(15) === 32) {
      if (bytes.length < 30) return undefined;
      // Dimensions at bytes 26-29 (little-endian, 14-bit each)
      const w0: int = bytes.readUInt8(26);
      const w1: int = bytes.readUInt8(27);
      const h0: int = bytes.readUInt8(28);
      const h1: int = bytes.readUInt8(29);
      const width: int = (w0 | (w1 << shift8)) & 0x3fff;
      const height: int = (h0 | (h1 << shift8)) & 0x3fff;
      return new ImageDimensions(width, height);
    }

    // VP8L lossless format
    if (bytes.readUInt8(12) === 86 && bytes.readUInt8(13) === 80 && bytes.readUInt8(14) === 56 && bytes.readUInt8(15) === 76) {
      if (bytes.length < 25) return undefined;
      // Signature byte at 20, then 4 bytes with packed width/height
      const b0: int = bytes.readUInt8(21);
      const b1: int = bytes.readUInt8(22);
      const b2: int = bytes.readUInt8(23);
      const b3: int = bytes.readUInt8(24);
      const width: int = ((b0 | (b1 << shift8)) & 0x3fff) + 1;
      const height: int = (((b1 >> shift6) | (b2 << shift2) | (b3 << shift10)) & 0x3fff) + 1;
      return new ImageDimensions(width, height);
    }

    return undefined;
  }

  /**
   * Try to parse image dimensions from bytes based on file signature.
   */
  static parseImageDimensions(bytes: Buffer): ImageDimensions | undefined {
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
  dir: string;
  file: string;

  constructor(dir: string, file: string) {
    this.dir = dir;
    this.file = file;
  }
}

class FileBaseExtSplit {
  base: string;
  ext: string;

  constructor(base: string, ext: string) {
    this.base = base;
    this.ext = ext;
  }
}

export class ResourceManager {
  siteDir: string;
  themeDir: string | undefined;
  outputDir: string;

  siteAssetsDir: string;
  themeAssetsDir: string | undefined;

  cache: Map<string, Resource>;
  siteAssetFiles: string[];
  themeAssetFiles: string[];

  static normalizeSlashes(path: string): string {
    return path.replaceAll("\\", "/");
  }

  static normalizeRel(path: string): string {
    const slash = "/";
    const normalized = ResourceManager.normalizeSlashes(path.trim());
    return trimStartChar(normalized, slash);
  }

  static toOsRelPath(relPath: string): string {
    const slash = "/";
    return replaceText(relPath, slash, `${Path.DirectorySeparatorChar}`);
  }

  /**
   * Get MIME type from file extension.
   */
  static getMediaType(ext: string): string {
    const e = ext.toLowerCase();
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
    const e = ext.toLowerCase();
    return e === ".png" || e === ".jpg" || e === ".jpeg" || e === ".gif" || e === ".webp" || e === ".bmp";
  }

  static splitDirAndFile(relPath: string): DirFileSplit {
    const slash = "/";
    const normalized = ResourceManager.normalizeRel(relPath);
    const idx = normalized.lastIndexOf(slash);
    if (idx < 0) return new DirFileSplit("", normalized);
    return new DirFileSplit(substringCount(normalized, 0, idx + 1), substringFrom(normalized, idx + 1));
  }

  static splitFileBaseAndExt(fileName: string): FileBaseExtSplit {
    const idx = fileName.lastIndexOf(".");
    if (idx < 0) return new FileBaseExtSplit(fileName, "");
    return new FileBaseExtSplit(substringCount(fileName, 0, idx), substringFrom(fileName, idx));
  }

  static segmentMatch(pattern: string, segment: string): boolean {
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

  static splitGlobSegments(raw: string): string[] {
    const normalized = ResourceManager.normalizeRel(raw);
    if (normalized === "") {
      const empty: string[] = [];
      return empty;
    }
    return normalized.split("/");
  }

  static globMatchAt(patSegs: string[], pathSegs: string[], pi: int, si: int): boolean {
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

  static globMatch(patternRaw: string, pathRaw: string): boolean {
    const patSegs = ResourceManager.splitGlobSegments(patternRaw);
    const pathSegs = ResourceManager.splitGlobSegments(pathRaw);
    return ResourceManager.globMatchAt(patSegs, pathSegs, 0, 0);
  }

  constructor(siteDir: string, themeDirRaw: string | undefined, outputDir: string) {
    const themeDir = themeDirRaw;
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.siteAssetsDir = Path.Combine(siteDir, "assets");
    this.themeAssetsDir = themeDir !== undefined ? Path.Combine(themeDir, "assets") : undefined;
    this.cache = new Map<string, Resource>();
    const emptyFiles: string[] = [];
    this.siteAssetFiles = Directory.Exists(this.siteAssetsDir)
      ? Array.from(Directory.GetFiles(this.siteAssetsDir, "*", SearchOption.AllDirectories))
      : emptyFiles;
    const themeAssetsDir = this.themeAssetsDir;
    this.themeAssetFiles = themeAssetsDir !== undefined && Directory.Exists(themeAssetsDir)
      ? Array.from(Directory.GetFiles(themeAssetsDir, "*", SearchOption.AllDirectories))
      : emptyFiles;
  }

  resolveAssetFullPath(relPathRaw: string): string | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const osRel = ResourceManager.toOsRelPath(rel);
    const sitePath = Path.Combine(this.siteAssetsDir, osRel);
    if (File.Exists(sitePath)) return sitePath;
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      const themePath = Path.Combine(themeAssetsDir, osRel);
      if (File.Exists(themePath)) return themePath;
    }
    return undefined;
  }

  get(relPathRaw: string): Resource | undefined {
    const rel = ResourceManager.normalizeRel(relPathRaw);
    if (rel === "") return undefined;
    const key = `get:${rel}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const full = this.resolveAssetFullPath(rel);
    if (full === undefined) return undefined;

    const bytes = readFileSync(full);
    const ext = (Path.GetExtension(full) ?? "").toLowerCase();
    const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".svg" || ext === ".html" || ext === ".txt";
    const text = isText ? bytes.toString("utf8") : undefined;
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
    this.cache.set(key, res);
    return res;
  }

  getMatch(pattern: string): Resource | undefined {
    const pat = pattern.trim();
    if (pat === "") return undefined;
    if (!pat.includes("*")) return this.get(pat);

    for (let i = 0; i < this.siteAssetFiles.length; i++) {
      const full = this.siteAssetFiles[i]!;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      if (!ResourceManager.globMatch(pat, rel)) continue;
      return this.get(rel);
    }

    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.length; i++) {
        const full = this.themeAssetFiles[i]!;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(themeAssetsDir, full));
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
    const pat = pattern.trim();
    const result: Resource[] = [];
    if (pat === "") return result;

    // Track paths already added (site assets take priority over theme)
    const added = new Map<string, boolean>();

    // Search site assets first
    for (let i = 0; i < this.siteAssetFiles.length; i++) {
      const full = this.siteAssetFiles[i]!;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      if (!ResourceManager.globMatch(pat, rel)) continue;
      const res = this.get(rel);
      if (res !== undefined) {
        result.push(res);
        added.set(rel, true);
      }
    }

    // Search theme assets
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.length; i++) {
        const full = this.themeAssetFiles[i]!;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(themeAssetsDir, full));
        if (!ResourceManager.globMatch(pat, rel)) continue;
        // Skip if site already has this path
        if (added.has(rel)) continue;
        const res = this.get(rel);
        if (res !== undefined) result.push(res);
      }
    }

    return result;
  }

  /**
   * Get all resources of a given media type (e.g., "image", "text").
   */
  byType(mediaType: string): Resource[] {
    const targetType = mediaType.trim().toLowerCase();
    const result: Resource[] = [];
    const added = new Map<string, boolean>();

    const matchesType = (path: string): boolean => {
      const ext = (Path.GetExtension(path) ?? "").toLowerCase();
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
    for (let i = 0; i < this.siteAssetFiles.length; i++) {
      const full = this.siteAssetFiles[i]!;
      if (!matchesType(full)) continue;
      const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(this.siteAssetsDir, full));
      const res = this.get(rel);
      if (res !== undefined) {
        result.push(res);
        added.set(rel, true);
      }
    }

    // Search theme assets
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined) {
      for (let i = 0; i < this.themeAssetFiles.length; i++) {
        const full = this.themeAssetFiles[i]!;
        if (!matchesType(full)) continue;
        const rel = ResourceManager.normalizeSlashes(Path.GetRelativePath(themeAssetsDir, full));
        if (added.has(rel)) continue;
        const res = this.get(rel);
        if (res !== undefined) result.push(res);
      }
    }

    return result;
  }

  /**
   * Concatenate multiple resources into one. Text is joined with newlines.
   */
  concat(targetPath: string, resources: Resource[]): Resource {
    const target = ResourceManager.normalizeRel(targetPath);
    const keySb = new StringBuilder();
    keySb.Append("concat:");
    keySb.Append(target);
    for (let i = 0; i < resources.length; i++) keySb.Append("|" + resources[i]!.id);
    const key = keySb.ToString();

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const sb = new StringBuilder();
    for (let i = 0; i < resources.length; i++) {
      const res = resources[i]!;
      const resText = res.text;
      if (resText !== undefined) {
        if (sb.Length > 0) sb.Append("\n");
        sb.Append(resText);
      }
    }
    const text = sb.ToString();
    const bytes = Buffer.from(text, "utf8");

    const result = new Resource(key, undefined, true, target, bytes, text, new ResourceData(""));
    this.cache.set(key, result);
    return result;
  }

  fromString(nameRaw: string, content: string): Resource {
    const name = nameRaw.trim();
    const key = `fromString:${name}`;
    const bytes = Buffer.from(content, "utf8");
    return new Resource(key, undefined, false, undefined, bytes, content, new ResourceData(""));
  }

  ensurePublished(resource: Resource): void {
    if (!resource.publishable) return;
    const outputRelPath = resource.outputRelPath;
    if (outputRelPath === undefined) return;

    const rel = ResourceManager.normalizeRel(outputRelPath);
    if (rel === "") return;
    const dest = Path.Combine(this.outputDir, ResourceManager.toOsRelPath(rel));
    const dir = Path.GetDirectoryName(dest);
    if (dir !== undefined && dir !== "") Directory.CreateDirectory(dir);
    writeFileSync(dest, resource.bytes);
  }

  minify(resource: Resource): Resource {
    const key = `${resource.id}|minify`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const resourceText = resource.text;
    if (resourceText === undefined) {
      const copy = new Resource(key, resource.sourcePath, resource.publishable, resource.outputRelPath, resource.bytes, undefined, resource.Data);
      this.cache.set(key, copy);
      return copy;
    }

    const lines = replaceLineEndings(resourceText, "\n").split("\n");
    const sb = new StringBuilder();
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim();
      if (trimmed === "") continue;
      if (sb.Length > 0) sb.Append("\n");
      sb.Append(trimmed);
    }
    const minified = sb.ToString();
    const bytes = Buffer.from(minified, "utf8");

    const outPath = resource.outputRelPath;
    const updated = new Resource(key, resource.sourcePath, resource.publishable, outPath, bytes, minified, resource.Data);
    this.cache.set(key, updated);
    return updated;
  }

  fingerprint(resource: Resource): Resource {
    const key = `${resource.id}|fingerprint`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const integrity = `sha256-${createHash("sha256").update(resource.bytes).digest("base64")}`;
    const fullHex = createHash("sha256").update(resource.bytes).digest("hex");
    const shortHex = substringCount(fullHex, 0, 16);

    const outRel = resource.outputRelPath;
    const outPath = outRel !== undefined ? ResourceManager.normalizeRel(outRel) : "";
    const split = ResourceManager.splitDirAndFile(outPath);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const hashedFile = fileSplit.ext === "" ? `${fileSplit.base}.${shortHex}` : `${fileSplit.base}.${shortHex}${fileSplit.ext}`;
    const hashedPath = split.dir + hashedFile;

    const updated = new Resource(key, resource.sourcePath, resource.publishable, hashedPath, resource.bytes, resource.text, new ResourceData(integrity));
    this.cache.set(key, updated);
    return updated;
  }

  /**
   * Copy a resource to a new output path.
   * In Hugo: resources.Copy "targetPath" $resource
   */
  copy(targetPath: string, resource: Resource): Resource {
    const normalizedTarget = ResourceManager.normalizeRel(targetPath);
    const key = `${resource.id}|copy:${normalizedTarget}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const updated = new Resource(key, resource.sourcePath, resource.publishable, normalizedTarget, resource.bytes, resource.text, resource.Data, resource.mediaType, resource.width, resource.height);
    this.cache.set(key, updated);
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
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const resourceText = resource.text;
    if (resourceText === undefined) throw new Exception("css.Sass expects a text resource");

    const sassExeRaw = Environment.GetEnvironmentVariable("TSUMO_SASS");
    const sassExe = sassExeRaw !== undefined && sassExeRaw.trim() !== "" ? sassExeRaw.trim() : "sass";

    const tmpDir = Path.Combine(this.outputDir, ".tsumo", "sass");
    Directory.CreateDirectory(tmpDir);

    const inputPath = Path.Combine(tmpDir, "input.scss");
    const outputPath = Path.Combine(tmpDir, "output.css");
    File.WriteAllText(inputPath, resourceText);

    const args: string[] = [];
    args.push("--no-source-map");
    args.push("--style");
    args.push("expanded");
    if (Directory.Exists(this.siteAssetsDir)) {
      args.push("--load-path");
      args.push(this.siteAssetsDir);
    }
    const themeAssetsDir = this.themeAssetsDir;
    if (themeAssetsDir !== undefined && Directory.Exists(themeAssetsDir)) {
      args.push("--load-path");
      args.push(themeAssetsDir);
    }
    args.push(inputPath);
    args.push(outputPath);

    const startInfo = new ProcessStartInfo();
    startInfo.FileName = sassExe;
    const argsText = new StringBuilder();
    const argsArr = args;
    const quoteArg = (arg: string): string => {
      const trimmed = arg.trim();
      if (trimmed === "") return trimmed;
      if (!trimmed.includes(" ") && !trimmed.includes("\"")) return trimmed;
      return "\"" + replaceText(trimmed, "\"", "\\\"") + "\"";
    };
    for (let i = 0; i < argsArr.length; i++) {
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
      const err = process.StandardError.ReadToEnd();
      throw new Exception(err.trim() === "" ? `Sass compiler failed (exit ${process.ExitCode})` : err);
    }

    if (!File.Exists(outputPath)) throw new Exception("Sass compiler did not produce output");
    const cssText = File.ReadAllText(outputPath);
    const cssBytes = Buffer.from(cssText, "utf8");

    const outRel = resource.outputRelPath ?? "style.scss";
    const split = ResourceManager.splitDirAndFile(outRel);
    const fileSplit = ResourceManager.splitFileBaseAndExt(split.file);
    const cssFile = fileSplit.base + ".css";
    const cssRel = split.dir + cssFile;

    const updated = new Resource(key, resource.sourcePath, true, cssRel, cssBytes, cssText, resource.Data);
    this.cache.set(key, updated);
    return updated;
  }

  /**
   * Parse Hugo-style resize spec (e.g., "300x200", "300x", "x200").
   * Returns dimensions where 0 means "auto".
   */
  static tryParseInt(s: string): int {
    if (s === "") return 0;
    return parseInt32(s) ?? 0;
  }

  static parseResizeWidth(spec: string): int {
    const s = spec.trim().toLowerCase();
    const xIdx = s.indexOf("x");
    if (xIdx < 0) {
      // Just a number - interpret as width
      return ResourceManager.tryParseInt(s);
    }
    const wPart = substringCount(s, 0, xIdx).trim();
    return ResourceManager.tryParseInt(wPart);
  }

  static parseResizeHeight(spec: string): int {
    const s = spec.trim().toLowerCase();
    const xIdx = s.indexOf("x");
    if (xIdx < 0) {
      return 0;
    }
    const hPart = substringFrom(s, xIdx + 1);
    // Extract just the numeric part (handle things like "300x200 webp q80")
    const hStr = hPart.split(" ")[0]!.trim();
    return ResourceManager.tryParseInt(hStr);
  }

  /**
   * Get output format from resize spec (e.g., "300x200 webp" -> "webp").
   * Returns undefined if no format specified.
   */
  static parseResizeFormat(spec: string): string | undefined {
    const s = spec.trim().toLowerCase();
    const parts = s.split(" ");
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]!.trim();
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
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    // Need source path to process
    const sourcePath = resource.sourcePath;
    if (sourcePath === undefined) {
      throw new Exception("Cannot resize resource without source path");
    }

    // Determine output extension
    const srcExt = (Path.GetExtension(sourcePath) ?? "").toLowerCase();
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
    const tmpOut = Path.Combine(tmpDir, `${Path.GetFileNameWithoutExtension(sourcePath)}_${width}x${height}${outExt}`);

    // Configure MagicScaler settings
    ensureImageCodecsRegistered();
    const settings = new ProcessImageSettings();
    settings.Width = width;
    settings.Height = height;

    // Set output format if needed
    if (outFormat !== undefined) {
      settings.TrySetEncoderFormat(outExt);
    }

    // Process the image
    MagicImageProcessor.ProcessImage(sourcePath, tmpOut, settings);

    // Read processed image
    const bytes = readFileSync(tmpOut);

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
    this.cache.set(key, result);
    return result;
  }
}
