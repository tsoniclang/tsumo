import { StringComparison } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/core/types.js";

export const replaceText = (source: string, oldValue: string, newValue: string): string =>
  source.replace(oldValue, newValue, StringComparison.ordinal);

export const indexOfText = (source: string, value: string): int =>
  source.indexOf(value, 0, source.length, StringComparison.ordinal);

export const indexOfTextIgnoreCase = (source: string, value: string): int =>
  source.indexOf(value, 0, source.length, StringComparison.ordinalIgnoreCase);

export const indexOfTextFrom = (source: string, value: string, startIndex: int): int =>
  source.indexOf(value, startIndex, source.length - startIndex, StringComparison.ordinal);
