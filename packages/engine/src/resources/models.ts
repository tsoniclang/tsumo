import { Buffer } from "node:buffer";
import type { int } from "@tsonic/csharp/types.js";

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
}
