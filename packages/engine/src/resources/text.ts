import { Buffer } from "node:buffer";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { Resource } from "./models.js";

function byteInRange(bytes: Buffer, index: int32, minimum: int32, maximum: int32): boolean {
  if (index >= bytes.length) return false;
  const byte: int32 = bytes.readUInt8(index);
  return byte >= minimum && byte <= maximum;
}

export function isValidUtf8(bytes: Buffer): boolean {
  let index: int32 = 0;
  while (index < bytes.length) {
    const first: int32 = bytes.readUInt8(index);
    if (first <= 0x7f) {
      index++;
      continue;
    }
    if (first >= 0xc2 && first <= 0xdf) {
      if (!byteInRange(bytes, index + 1, 0x80, 0xbf)) return false;
      index += 2;
      continue;
    }
    if (first === 0xe0) {
      if (!byteInRange(bytes, index + 1, 0xa0, 0xbf) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf)) return false;
      index += 3;
      continue;
    }
    if ((first >= 0xe1 && first <= 0xec) || (first >= 0xee && first <= 0xef)) {
      if (!byteInRange(bytes, index + 1, 0x80, 0xbf) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf)) return false;
      index += 3;
      continue;
    }
    if (first === 0xed) {
      if (!byteInRange(bytes, index + 1, 0x80, 0x9f) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf)) return false;
      index += 3;
      continue;
    }
    if (first === 0xf0) {
      if (!byteInRange(bytes, index + 1, 0x90, 0xbf) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf) ||
          !byteInRange(bytes, index + 3, 0x80, 0xbf)) return false;
      index += 4;
      continue;
    }
    if (first >= 0xf1 && first <= 0xf3) {
      if (!byteInRange(bytes, index + 1, 0x80, 0xbf) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf) ||
          !byteInRange(bytes, index + 3, 0x80, 0xbf)) return false;
      index += 4;
      continue;
    }
    if (first === 0xf4) {
      if (!byteInRange(bytes, index + 1, 0x80, 0x8f) ||
          !byteInRange(bytes, index + 2, 0x80, 0xbf) ||
          !byteInRange(bytes, index + 3, 0x80, 0xbf)) return false;
      index += 4;
      continue;
    }
    return false;
  }
  return true;
}

export function readResourceText(resource: Resource, operation: string): string {
  const text = resource.text;
  if (text !== undefined) return text;
  if (!isValidUtf8(resource.bytes)) {
    throw createTsumoError(
      "TSUMO_RESOURCE_TEXT_ENCODING_INVALID",
      `${operation} requires a UTF-8 resource`,
      resource.sourcePath,
    );
  }
  return resource.bytes.toString("utf8");
}
