import type { int32 } from "@tsonic/core/types.js";
import { String as DotnetString } from "@tsonic/dotnet/System.js";
import { createTsumoError } from "../diagnostics.js";

function substringError(): void {
  throw createTsumoError("TSUMO_INTERNAL_STRING_RANGE_INVALID", "Substring bounds are out of range");
}

const requireSubstringBounds = (source: string, startIndex: int32, length: int32): void => {
  if (startIndex < 0 || length < 0 || startIndex > source.length || startIndex + length > source.length) {
    substringError();
  }
};

export const replaceText = (source: string, oldValue: string, newValue: string): string => {
  return source.replaceAll(oldValue, newValue);
};

export const indexOfText = (source: string, value: string): int32 => source.indexOf(value) as int32;

export const indexOfTextIgnoreCase = (source: string, value: string): int32 => {
  return source.toLowerCase().indexOf(value.toLowerCase()) as int32;
};

export const indexOfTextFrom = (source: string, value: string, startIndex: int32): int32 => {
  return source.indexOf(value, startIndex) as int32;
};

export const lastIndexOfText = (source: string, value: string): int32 => source.lastIndexOf(value) as int32;

export const containsText = (source: string, value: string): boolean => source.includes(value);

export const compareText = (left: string, right: string): int32 => {
  return DotnetString.CompareOrdinal(left, right);
};

export const substringFrom = (source: string, startIndex: int32): string => {
  if (startIndex < 0 || startIndex > source.length) {
    substringError();
  }
  return source.substring(startIndex);
};

export const substringCount = (source: string, startIndex: int32, length: int32): string => {
  requireSubstringBounds(source, startIndex, length);
  return source.substring(startIndex, startIndex + length);
};

export const charAtText = (source: string, index: int32): string => {
  if (index < 0 || index >= source.length) return "";
  return source.substring(index, index + 1);
};

export const codePointAtText = (source: string, index: int32): string => {
  const codePoint = source.codePointAt(index);
  return codePoint === undefined ? "" : String.fromCodePoint(codePoint);
};

export const nextCodePointIndex = (source: string, index: int32): int32 => {
  const codePoint = source.codePointAt(index);
  if (codePoint === undefined) return source.length as int32;
  return (index + (codePoint > 0xffff ? 2 : 1)) as int32;
};

export const codePointLength = (source: string): int32 => {
  let count: int32 = 0;
  let index: int32 = 0;
  while (index < source.length) {
    index = nextCodePointIndex(source, index);
    count++;
  }
  return count;
};

const utf16IndexAtCodePoint = (source: string, codePointIndex: int32): int32 => {
  if (codePointIndex < 0) substringError();
  let currentCodePoint: int32 = 0;
  let utf16Index: int32 = 0;
  while (currentCodePoint < codePointIndex && utf16Index < source.length) {
    utf16Index = nextCodePointIndex(source, utf16Index);
    currentCodePoint++;
  }
  if (currentCodePoint !== codePointIndex) substringError();
  return utf16Index;
};

export const substringCodePoints = (source: string, startIndex: int32, length: int32): string => {
  if (startIndex < 0 || length < 0) substringError();
  const start = utf16IndexAtCodePoint(source, startIndex);
  const end = utf16IndexAtCodePoint(source, startIndex + length);
  return substringCount(source, start, end - start);
};

export const trimStartCodePoints = (source: string, cutset: string): string => {
  let start: int32 = 0;
  while (start < source.length) {
    const next = nextCodePointIndex(source, start);
    if (!cutset.includes(substringCount(source, start, next - start))) break;
    start = next;
  }
  return substringFrom(source, start);
};

export const trimEndCodePoints = (source: string, cutset: string): string => {
  let index: int32 = 0;
  let end: int32 = 0;
  while (index < source.length) {
    const next = nextCodePointIndex(source, index);
    if (!cutset.includes(substringCount(source, index, next - index))) end = next;
    index = next;
  }
  return substringCount(source, 0, end);
};

export const trimCodePoints = (source: string, cutset: string): string =>
  trimEndCodePoints(trimStartCodePoints(source, cutset), cutset);

const isUnicodeSpace = (value: number): boolean =>
  (value >= 0x09 && value <= 0x0d) ||
  value === 0x20 ||
  value === 0x85 ||
  value === 0xa0 ||
  value === 0x1680 ||
  (value >= 0x2000 && value <= 0x200a) ||
  value === 0x2028 ||
  value === 0x2029 ||
  value === 0x202f ||
  value === 0x205f ||
  value === 0x3000;

export const trimUnicodeSpace = (source: string): string => {
  let start: int32 = 0;
  while (start < source.length) {
    const codePoint = source.codePointAt(start);
    if (codePoint === undefined || !isUnicodeSpace(codePoint)) break;
    start = nextCodePointIndex(source, start);
  }
  let index: int32 = start;
  let end: int32 = start;
  while (index < source.length) {
    const codePoint = source.codePointAt(index);
    const next = nextCodePointIndex(source, index);
    if (codePoint !== undefined && !isUnicodeSpace(codePoint)) end = next;
    index = next;
  }
  return substringCount(source, start, end - start);
};

export function zeroPadInteger(value: int32, width: int32): string {
  let result = `${value}`;
  while (result.length < width) result = `0${result}`;
  return result;
}

export const trimStartChar = (source: string, ch: string): string => {
  let start = 0;
  while (start < source.length && source.substring(start, start + 1) === ch) {
    start++;
  }
  return source.substring(start);
};

export const trimEndChar = (source: string, ch: string): string => {
  let end = source.length;
  while (end > 0 && source.substring(end - 1, end) === ch) {
    end--;
  }
  return source.substring(0, end);
};

export const replaceLineEndings = (source: string, replacement: string): string => {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return replacement === "\n" ? normalized : normalized.replaceAll("\n", replacement);
};

export const splitLines = (source: string): string[] => replaceLineEndings(source, "\n").split("\n");
