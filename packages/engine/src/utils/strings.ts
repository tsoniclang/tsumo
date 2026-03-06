import { Char, Exception } from "@tsonic/dotnet/System.js";
import type { char, int } from "@tsonic/core/types.js";

const requireSubstringBounds = (
  source: string,
  startIndex: int,
  length: int
): void => {
  if (startIndex < 0 || length < 0 || startIndex > source.length) {
    throw new Exception("substring bounds are out of range");
  }
  if (startIndex + length > source.length) {
    throw new Exception("substring bounds are out of range");
  }
};

export const replaceText = (
  source: string,
  oldValue: string,
  newValue: string
): string => source.replaceAll(oldValue, newValue);

export const indexOfText = (source: string, value: string): int =>
  source.indexOf(value);

export const indexOfTextIgnoreCase = (source: string, value: string): int =>
  source.toLowerCase().indexOf(value.toLowerCase());

export const indexOfTextFrom = (
  source: string,
  value: string,
  startIndex: int
): int => source.indexOf(value, startIndex);

export const lastIndexOfText = (source: string, value: string): int =>
  source.lastIndexOf(value);

export const containsText = (source: string, value: string): boolean =>
  source.includes(value);

export const compareText = (left: string, right: string): int =>
  left === right ? 0 : left < right ? -1 : 1;

export const substringFrom = (source: string, startIndex: int): string => {
  if (startIndex < 0 || startIndex > source.length) {
    throw new Exception("substring start is out of range");
  }
  return source.substring(startIndex);
};

export const substringCount = (
  source: string,
  startIndex: int,
  length: int
): string => {
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

export const replaceLineEndings = (
  source: string,
  replacement: string
): string => {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return replacement === "\n"
    ? normalized
    : normalized.replaceAll("\n", replacement);
};

export const splitLines = (source: string): string[] =>
  replaceLineEndings(source, "\n").split("\n");

export const toChars = (source: string): char[] => {
  const chars = new Array<char>(source.length);
  for (let i = 0; i < source.length; i++) {
    chars[i] = Char.Parse(source.substring(i, i + 1));
  }
  return chars;
};
