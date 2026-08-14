import { Buffer } from "node:buffer";
import type { int32 } from "@tsonic/core/types.js";

export class ResourceData {
  Integrity: string;

  constructor(integrity: string) {
    this.Integrity = integrity;
  }
}

export class ImageDimensions {
  width: int32;
  height: int32;

  constructor(width: int32, height: int32) {
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
  width: int32;
  height: int32;

  constructor(
    id: string,
    sourcePath: string | undefined,
    publishable: boolean,
    outputRelPath: string | undefined,
    bytes: Buffer,
    text: string | undefined,
    data: ResourceData,
    mediaType: string = "",
    width: int32 = 0,
    height: int32 = 0,
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
