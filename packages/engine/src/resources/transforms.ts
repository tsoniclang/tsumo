import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { replaceLineEndings, substringCount } from "../utils/strings.js";
import { resourceMediaTypeForExtension } from "./media-types.js";
import { Resource, ResourceData } from "./models.js";
import {
  normalizeResourceRelativePath,
  splitResourceFileName,
  splitResourcePath,
} from "./paths.js";

export const concatenateResources = (targetPath: string, resources: Resource[]): Resource => {
  const target = normalizeResourceRelativePath(targetPath);
  const identity = new StringBuilder();
  identity.Append("concat:");
  identity.Append(target);
  const text = new StringBuilder();
  for (let index = 0; index < resources.length; index++) {
    const resource = resources[index]!;
    identity.Append("|" + resource.id);
    if (resource.text !== undefined) {
      if (text.Length > 0) text.Append("\n");
      text.Append(resource.text);
    }
  }

  const content = text.ToString();
  const path = splitResourcePath(target);
  const file = splitResourceFileName(path.fileName);
  return new Resource(
    identity.ToString(),
    undefined,
    true,
    target,
    Buffer.from(content, "utf8"),
    content,
    new ResourceData(""),
    resourceMediaTypeForExtension(file.extension),
  );
};

export const createStringResource = (name: string, content: string): Resource => {
  const normalizedName = normalizeResourceRelativePath(name);
  const contentHash = createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
  return new Resource(
    `fromString:${normalizedName}:${contentHash}`,
    undefined,
    false,
    undefined,
    Buffer.from(content, "utf8"),
    content,
    new ResourceData(""),
  );
};

export const minifyResource = (resource: Resource): Resource => {
  const identity = `${resource.id}|minify`;
  const resourceText = resource.text;
  if (resourceText === undefined) {
    return new Resource(
      identity,
      resource.sourcePath,
      resource.publishable,
      resource.outputRelPath,
      resource.bytes,
      undefined,
      resource.Data,
      resource.mediaType,
      resource.width,
      resource.height,
    );
  }

  const lines = replaceLineEndings(resourceText, "\n").split("\n");
  const output = new StringBuilder();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!.trim();
    if (line === "") continue;
    if (output.Length > 0) output.Append("\n");
    output.Append(line);
  }
  const text = output.ToString();
  return new Resource(
    identity,
    resource.sourcePath,
    resource.publishable,
    resource.outputRelPath,
    Buffer.from(text, "utf8"),
    text,
    resource.Data,
    resource.mediaType,
    resource.width,
    resource.height,
  );
};

export const fingerprintResource = (resource: Resource): Resource => {
  const hash = createHash("sha256").update(resource.bytes);
  const integrity = `sha256-${hash.digest("base64")}`;
  const fullHex = createHash("sha256").update(resource.bytes).digest("hex");
  const shortHex = substringCount(fullHex, 0, 16);
  const outputPath = resource.outputRelPath;
  let hashedPath: string | undefined = undefined;
  if (outputPath !== undefined) {
    const path = splitResourcePath(outputPath);
    const file = splitResourceFileName(path.fileName);
    const hashedFile = file.extension === ""
      ? `${file.baseName}.${shortHex}`
      : `${file.baseName}.${shortHex}${file.extension}`;
    hashedPath = path.directory + hashedFile;
  }

  return new Resource(
    `${resource.id}|fingerprint`,
    resource.sourcePath,
    resource.publishable,
    hashedPath,
    resource.bytes,
    resource.text,
    new ResourceData(integrity),
    resource.mediaType,
    resource.width,
    resource.height,
  );
};

export const copyResource = (targetPath: string, resource: Resource): Resource =>
  new Resource(
    `${resource.id}|copy:${normalizeResourceRelativePath(targetPath)}`,
    resource.sourcePath,
    resource.publishable,
    normalizeResourceRelativePath(targetPath),
    resource.bytes,
    resource.text,
    resource.Data,
    resource.mediaType,
    resource.width,
    resource.height,
  );
