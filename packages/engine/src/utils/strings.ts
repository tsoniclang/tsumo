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
