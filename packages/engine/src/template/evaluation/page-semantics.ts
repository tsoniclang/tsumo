import { Exception } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/csharp/types.js";
import { PageContext } from "../../models.js";
import { compareText, substringCount, substringFrom } from "../../utils/strings.js";
import { toPlainString } from "../runtime-helpers.js";
import { AnyArrayValue, DictValue, NumberValue, PageArrayValue, PageValue, StringArrayValue, StringValue, TemplateValue, VersionStringValue } from "../values.js";
import type { RenderScope } from "../scope.js";
import { parseDateTime } from "./scalar-semantics.js";

export const toTitleCase = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const parts = trimmed.split(" ");
  const sb = new StringBuilder();
  for (let i = 0; i < parts.length; i++) {
    const word = parts[i]!;
    if (word.trim() === "") continue;
    if (sb.Length > 0) sb.Append(" ");
    const first = substringCount(word, 0, 1).toUpperCase();
    const rest = word.length > 1 ? substringFrom(word, 1).toLowerCase() : "";
    sb.Append(first);
    sb.Append(rest);
  }
  return sb.ToString();
};

export const toPages = (value: TemplateValue): PageContext[] => {
  if (value instanceof PageArrayValue) return value.value;
  if (value instanceof AnyArrayValue) {
    const out: PageContext[] = [];
    for (let i = 0; i < value.value.length; i++) {
      const cur = value.value[i]!;
      if (cur instanceof PageValue) out.push((cur as PageValue).value);
    }
    return out;
  }
  const empty: PageContext[] = [];
  return empty;
};

/**
 * Sort pages by date field. Returns a new sorted array (ascending by default).
 * @param pages - The pages to sort
 * @param field - "date", "lastmod", or "publishdate"
 */

export const sortPagesByDate = (pages: PageContext[], field: string): PageContext[] => {
  const copy: PageContext[] = [];
  for (let i = 0; i < pages.length; i++) copy.push(pages[i]!);

  // Simple bubble sort for stability and tsonic compatibility
  const arr = copy;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      const a = arr[j]!;
      const b = arr[j + 1]!;
      // Use date for all fields (publishdate falls back to date)
      const dateA = field === "lastmod" ? a.lastmod : a.date;
      const dateB = field === "lastmod" ? b.lastmod : b.date;
      // Compare dates (ascending order)
      if (compareText(dateA, dateB) > 0) {
        arr[j] = b;
        arr[j + 1] = a;
      }
    }
  }
  return arr;
};

/**
 * Sort pages by title. Returns a new sorted array (ascending).
 */

export const sortPagesByTitle = (pages: PageContext[]): PageContext[] => {
  const copy: PageContext[] = [];
  for (let i = 0; i < pages.length; i++) copy.push(pages[i]!);

  // Simple bubble sort
  const arr = copy;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i - 1; j++) {
      const a = arr[j]!;
      const b = arr[j + 1]!;
      if (compareText(a.title, b.title) > 0) {
        arr[j] = b;
        arr[j + 1] = a;
      }
    }
  }
  return arr;
};

/**
 * Sort pages by weight. Returns a new sorted array (ascending).
 * Note: PageContext currently doesn't have a weight field, so this returns original order.
 */

export const sortPagesByWeight = (): PageContext[] => {
  throw new Exception("Page weight sorting is not supported by the current page model");
};

/**
 * Reverse the order of pages. Returns a new reversed array.
 */

export const reversePages = (pages: PageContext[]): PageContext[] => {
  const len = pages.length;
  const reversed: PageContext[] = [];
  for (let i = len - 1; i >= 0; i--) reversed.push(pages[i]!);
  return reversed;
};

/**
 * Copy a page array to a new array.
 */

export const copyPageArray = (pages: PageContext[]): PageContext[] => {
  const copy: PageContext[] = [];
  for (let i = 0; i < pages.length; i++) copy.push(pages[i]!);
  return copy;
};

/**
 * Copy a string array to a new array.
 */

export const copyStringArray = (strings: string[]): string[] => {
  const copy: string[] = [];
  for (let i = 0; i < strings.length; i++) copy.push(strings[i]!);
  return copy;
};

/**
 * Compare two template values for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */

export const compareValues = (a: TemplateValue, b: TemplateValue): int => {
  // Compare strings
  if (a instanceof StringValue && b instanceof StringValue) {
    const aStr = (a as StringValue).value;
    const bStr = (b as StringValue).value;
    return compareText(aStr, bStr);
  }
  // Compare numbers
  if (a instanceof NumberValue && b instanceof NumberValue) {
    const aNum: int = (a as NumberValue).value;
    const bNum: int = (b as NumberValue).value;
    if (aNum < bNum) return -1;
    if (aNum > bNum) return 1;
    return 0;
  }
  // Compare as strings (fallback)
  const aPlain = toPlainString(a);
  const bPlain = toPlainString(b);
  return compareText(aPlain, bPlain);
};

export const matchWhere = (actual: TemplateValue, op: string, expected: TemplateValue): boolean => {
  const opLower = op.trim().toLowerCase();
  const actualText = toPlainString(actual);

  if (opLower === "eq" || opLower === "==") {
    return actualText === toPlainString(expected);
  }
  if (opLower === "ne" || opLower === "!=") {
    return actualText !== toPlainString(expected);
  }
  if (opLower === "in") {
    if (expected instanceof AnyArrayValue) {
      for (let i = 0; i < expected.value.length; i++) {
        if (toPlainString(expected.value[i]!) === actualText) return true;
      }
      return false;
    }
    if (expected instanceof StringArrayValue) {
      for (let i = 0; i < expected.value.length; i++) {
        if (expected.value[i]! === actualText) return true;
      }
      return false;
    }
    if (expected instanceof DictValue) {
      return expected.value.has(actualText);
    }
    return false;
  }
  if (opLower === "not in") {
    return !matchWhere(actual, "in", expected);
  }

  return false;
};
