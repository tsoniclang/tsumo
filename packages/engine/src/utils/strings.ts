import { StringComparison } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/core/types.js";

export const replaceText = (source: string, oldValue: string, newValue: string): string =>
  source.Replace(oldValue, newValue, StringComparison.Ordinal);

export const indexOfText = (source: string, value: string): int =>
  source.IndexOf(value, 0, source.Length, StringComparison.Ordinal);

export const indexOfTextIgnoreCase = (source: string, value: string): int =>
  source.IndexOf(value, 0, source.Length, StringComparison.OrdinalIgnoreCase);

export const indexOfTextFrom = (source: string, value: string, startIndex: int): int =>
  source.IndexOf(value, startIndex, source.Length - startIndex, StringComparison.Ordinal);

export const lastIndexOfText = (source: string, value: string): int =>
  source.LastIndexOf(value, source.Length - 1, source.Length, StringComparison.Ordinal);
