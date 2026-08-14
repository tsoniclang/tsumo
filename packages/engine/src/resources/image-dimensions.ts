import { Buffer } from "node:buffer";
import type { int32 } from "@tsonic/core/types.js";
import { ImageDimensions } from "./models.js";

const shift2: int32 = 2;
const shift6: int32 = 6;
const shift8: int32 = 8;
const shift10: int32 = 10;
const shift16: int32 = 16;
const shift24: int32 = 24;

const parsePngDimensions = (bytes: Buffer): ImageDimensions | undefined => {
  if (bytes.length < 24) return undefined;
  if (
    bytes.readUInt8(0) !== 137 ||
    bytes.readUInt8(1) !== 80 ||
    bytes.readUInt8(2) !== 78 ||
    bytes.readUInt8(3) !== 71
  ) {
    return undefined;
  }

  const width: int32 =
    (bytes.readUInt8(16) << shift24) |
    (bytes.readUInt8(17) << shift16) |
    (bytes.readUInt8(18) << shift8) |
    bytes.readUInt8(19);
  const height: int32 =
    (bytes.readUInt8(20) << shift24) |
    (bytes.readUInt8(21) << shift16) |
    (bytes.readUInt8(22) << shift8) |
    bytes.readUInt8(23);
  return new ImageDimensions(width, height);
};

const parseJpegDimensions = (bytes: Buffer): ImageDimensions | undefined => {
  if (bytes.length < 2 || bytes.readUInt8(0) !== 0xff || bytes.readUInt8(1) !== 0xd8) return undefined;

  let index = 2;
  while (index < bytes.length - 1) {
    if (bytes.readUInt8(index) !== 0xff) {
      index++;
      continue;
    }

    const marker = bytes.readUInt8(index + 1);
    if (marker === 0xc0 || marker === 0xc2) {
      if (index + 9 >= bytes.length) return undefined;
      const height: int32 = (bytes.readUInt8(index + 5) << shift8) | bytes.readUInt8(index + 6);
      const width: int32 = (bytes.readUInt8(index + 7) << shift8) | bytes.readUInt8(index + 8);
      return new ImageDimensions(width, height);
    }

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      index += 2;
      continue;
    }
    if (index + 4 >= bytes.length) return undefined;
    const length: int32 = (bytes.readUInt8(index + 2) << shift8) | bytes.readUInt8(index + 3);
    if (length < 2) return undefined;
    index += 2 + length;
  }
  return undefined;
};

const parseGifDimensions = (bytes: Buffer): ImageDimensions | undefined => {
  if (bytes.length < 10) return undefined;
  if (bytes.readUInt8(0) !== 71 || bytes.readUInt8(1) !== 73 || bytes.readUInt8(2) !== 70) return undefined;

  const width: int32 = bytes.readUInt8(6) | (bytes.readUInt8(7) << shift8);
  const height: int32 = bytes.readUInt8(8) | (bytes.readUInt8(9) << shift8);
  return new ImageDimensions(width, height);
};

const parseWebpDimensions = (bytes: Buffer): ImageDimensions | undefined => {
  if (bytes.length < 25) return undefined;
  if (
    bytes.readUInt8(0) !== 82 ||
    bytes.readUInt8(1) !== 73 ||
    bytes.readUInt8(2) !== 70 ||
    bytes.readUInt8(3) !== 70 ||
    bytes.readUInt8(8) !== 87 ||
    bytes.readUInt8(9) !== 69 ||
    bytes.readUInt8(10) !== 66 ||
    bytes.readUInt8(11) !== 80
  ) {
    return undefined;
  }

  if (
    bytes.length >= 30 &&
    bytes.readUInt8(12) === 86 &&
    bytes.readUInt8(13) === 80 &&
    bytes.readUInt8(14) === 56 &&
    bytes.readUInt8(15) === 32
  ) {
    const width: int32 = (bytes.readUInt8(26) | (bytes.readUInt8(27) << shift8)) & 0x3fff;
    const height: int32 = (bytes.readUInt8(28) | (bytes.readUInt8(29) << shift8)) & 0x3fff;
    return new ImageDimensions(width, height);
  }

  if (
    bytes.readUInt8(12) === 86 &&
    bytes.readUInt8(13) === 80 &&
    bytes.readUInt8(14) === 56 &&
    bytes.readUInt8(15) === 76
  ) {
    const byte0: int32 = bytes.readUInt8(21);
    const byte1: int32 = bytes.readUInt8(22);
    const byte2: int32 = bytes.readUInt8(23);
    const byte3: int32 = bytes.readUInt8(24);
    const width: int32 = ((byte0 | (byte1 << shift8)) & 0x3fff) + 1;
    const height: int32 = (((byte1 >> shift6) | (byte2 << shift2) | (byte3 << shift10)) & 0x3fff) + 1;
    return new ImageDimensions(width, height);
  }

  return undefined;
};

export const parseImageDimensions = (bytes: Buffer): ImageDimensions | undefined =>
  parsePngDimensions(bytes) ??
  parseJpegDimensions(bytes) ??
  parseGifDimensions(bytes) ??
  parseWebpDimensions(bytes);
