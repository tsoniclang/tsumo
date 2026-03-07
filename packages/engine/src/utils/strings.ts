import type { char, int } from "@tsonic/core/types.js";

const substringError = (): never => {
  throw new Error("substring bounds are out of range");
};

const requireSubstringBounds = (source: string, startIndex: int, length: int): void => {
  if (startIndex < 0 || length < 0 || startIndex > source.length || startIndex + length > source.length) {
    substringError();
  }
};

export const replaceText = (source: string, oldValue: string, newValue: string): string => {
  return source.replaceAll(oldValue, newValue);
};

export const indexOfText = (source: string, value: string): int => source.indexOf(value) as int;

export const indexOfTextIgnoreCase = (source: string, value: string): int => {
  return source.toLowerCase().indexOf(value.toLowerCase()) as int;
};

export const indexOfTextFrom = (source: string, value: string, startIndex: int): int => {
  return source.indexOf(value, startIndex) as int;
};

export const lastIndexOfText = (source: string, value: string): int => source.lastIndexOf(value) as int;

export const containsText = (source: string, value: string): boolean => source.includes(value);

export const compareText = (left: string, right: string): int => {
  return (left === right ? 0 : left < right ? -1 : 1) as int;
};

export const substringFrom = (source: string, startIndex: int): string => {
  if (startIndex < 0 || startIndex > source.length) {
    substringError();
  }
  return source.substring(startIndex);
};

export const substringCount = (source: string, startIndex: int, length: int): string => {
  requireSubstringBounds(source, startIndex, length);
  return source.substring(startIndex, startIndex + length);
};

export const charAtText = (source: string, index: int): string => {
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

export const toChars = (source: string): char[] => {
  const chars = new Array<char>(source.length);
  for (let i = 0; i < source.length; i++) {
    chars[i] = source[i]!;
  }
  return chars;
};
