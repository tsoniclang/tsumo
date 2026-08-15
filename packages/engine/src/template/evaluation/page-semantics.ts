import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";
import { PageContext, SiteContext } from "../../models.js";
import { ParamKind } from "../../params.js";
import { compareText, substringCount, substringFrom } from "../../utils/strings.js";
import { toPlainString } from "../runtime-helpers.js";
import { AnyArrayValue, BoolValue, DictValue, NumberValue, PageArrayValue, PageGroupValue, PageValue, StringArrayValue, StringValue, TemplateValue, VersionStringValue } from "../values.js";
import type { RenderScope } from "../scope.js";
import { findParam, paramToTemplateValue } from "./param-semantics.js";
import { formatDateTime } from "./scalar-semantics.js";
import { createTsumoError } from "../../diagnostics.js";

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

export const getPageTerms = (page: PageContext, taxonomyRaw: string): PageArrayValue => {
  const taxonomy = taxonomyRaw.trim().toLowerCase();
  const memberships = page.site.Taxonomies.get(taxonomy);
  const termPages = page.site.taxonomyTermPages.get(taxonomy);
  const selected: PageContext[] = [];
  if (memberships === undefined || termPages === undefined) return new PageArrayValue(selected);

  for (const termSlug of termPages.keys()) {
    const pages = memberships.get(termSlug);
    if (pages === undefined) continue;
    let includesPage = false;
    for (let index = 0; index < pages.length; index++) {
      if (pages[index] === page) {
        includesPage = true;
        break;
      }
    }
    if (!includesPage) continue;
    const termPage = termPages.get(termSlug);
    if (termPage !== undefined) selected.push(termPage);
  }
  return new PageArrayValue(selected);
};

export const pageHasShortcode = (page: PageContext, name: string): boolean =>
  page.shortcodeNames.has(name);

export const siteLastModification = (site: SiteContext): string => {
  let selected = "";
  let selectedTime = 0;
  let hasSelected = false;
  const pages = site.allPages.length > 0 ? site.allPages : site.pages;
  for (let index = 0; index < pages.length; index++) {
    const lastmod = pages[index]!.lastmod;
    const time = Date.parse(lastmod);
    if (Number.isNaN(time) || (hasSelected && time <= selectedTime)) continue;
    selected = lastmod;
    selectedTime = time;
    hasSelected = true;
  }
  return selected;
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
 */

export const pageWeight = (page: PageContext): int32 => {
  const value = findParam(page.Params, "weight");
  if (value === undefined) return 0;
  if (value.kind !== ParamKind.Number) {
    throw createTsumoError("TSUMO_TEMPLATE_PAGE_WEIGHT_INVALID", "Page weight requires a 32-bit integer front-matter value");
  }
  return value.numberValue;
};

export const sortPagesByWeight = (pages: PageContext[]): PageContext[] => {
  const sorted = copyPageArray(pages);
  for (let left: int32 = 0; left < sorted.length; left++) {
    for (let right: int32 = left + 1; right < sorted.length; right++) {
      if (pageWeight(sorted[left]!) <= pageWeight(sorted[right]!)) continue;
      const temporary = sorted[left]!;
      sorted[left] = sorted[right]!;
      sorted[right] = temporary;
    }
  }
  return sorted;
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

export const resolvePageCollectionProperty = (
  collection: PageArrayValue,
  propertyRaw: string,
): TemplateValue | undefined => {
  const property = propertyRaw.trim().toLowerCase();
  if (property === "bylastmod") return new PageArrayValue(sortPagesByDate(collection.value, "lastmod"));
  if (property === "bydate") return new PageArrayValue(sortPagesByDate(collection.value, "date"));
  if (property === "bypublishdate") return new PageArrayValue(sortPagesByDate(collection.value, "publishdate"));
  if (property === "bytitle" || property === "bylinktitle") return new PageArrayValue(sortPagesByTitle(collection.value));
  if (property === "byweight") return new PageArrayValue(sortPagesByWeight(collection.value));
  if (property === "reverse") return new PageArrayValue(reversePages(collection.value));
  if (property === "len") return new NumberValue(collection.value.length);
  return undefined;
};

export const pagesWithKind = (pages: PageContext[], kind: string): PageContext[] => {
  const selected: PageContext[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]!;
    if (page.kind === kind) selected.push(page);
  }
  return selected;
};

class RelatedPageCandidate {
  page: PageContext;
  score: int32;

  constructor(page: PageContext, score: int32) {
    this.page = page;
    this.score = score;
  }
}

const sharesExactText = (left: string[], right: string[]): boolean => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
      if (left[leftIndex] === right[rightIndex]) return true;
    }
  }
  return false;
};

const keywordValue = (page: PageContext): string | undefined => {
  for (const name of page.Params.keys()) {
    if (name.toLowerCase() !== "keywords") continue;
    const value = page.Params.get(name);
    return value?.stringValue;
  }
  return undefined;
};

const defaultRelatedPages = (pages: PageContext[], source: PageContext): PageArrayValue => {
  const candidates: RelatedPageCandidate[] = [];
  const sourceDate = pageDateMilliseconds(source);
  const sourceKeyword = keywordValue(source);
  for (let index = 0; index < pages.length; index++) {
    const candidate = pages[index]!;
    if (candidate === source) continue;
    const candidateDate = pageDateMilliseconds(candidate);
    if (sourceDate > 0 && candidateDate > sourceDate) continue;
    const sharesTags = sharesExactText(source.tags, candidate.tags);
    const candidateKeyword = keywordValue(candidate);
    const sharesKeyword = sourceKeyword !== undefined && candidateKeyword === sourceKeyword;
    const score: int32 = sharesKeyword ? (sharesTags ? 180 : 100) : sharesTags ? 80 : 0;
    if (score >= 80) candidates.push(new RelatedPageCandidate(candidate, score));
  }
  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      const leftCandidate = candidates[left]!;
      const rightCandidate = candidates[right]!;
      const dateOrder = compareText(leftCandidate.page.date, rightCandidate.page.date);
      const pathOrder = compareText(leftCandidate.page.relPermalink, rightCandidate.page.relPermalink);
      if (leftCandidate.score > rightCandidate.score) continue;
      if (leftCandidate.score === rightCandidate.score && dateOrder > 0) continue;
      if (leftCandidate.score === rightCandidate.score && dateOrder === 0 && pathOrder <= 0) continue;
      candidates[left] = rightCandidate;
      candidates[right] = leftCandidate;
    }
  }
  const result: PageContext[] = [];
  for (let index = 0; index < candidates.length; index++) result.push(candidates[index]!.page);
  return new PageArrayValue(result);
};

class PageGroupBuild {
  key: TemplateValue;
  pages: PageContext[];

  constructor(key: TemplateValue) {
    this.key = key;
    this.pages = [];
  }
}

const pageGroupingValue = (page: PageContext, fieldRaw: string): TemplateValue => {
  const field = fieldRaw.trim().toLowerCase();
  if (field === "weight") return new NumberValue(pageWeight(page));
  if (field === "title" || field === "linktitle") return new StringValue(page.title);
  if (field === "date" || field === "publishdate") return new StringValue(page.date);
  if (field === "lastmod") return new StringValue(page.lastmod);
  if (field === "draft") return new BoolValue(page.draft);
  if (field === "kind") return new StringValue(page.kind);
  if (field === "section") return new StringValue(page.section);
  if (field === "type") return new StringValue(page.type);
  if (field === "slug") return new StringValue(page.slug);
  if (field === "relpermalink") return new StringValue(page.relPermalink);
  if (field.startsWith("params.")) {
    const parameter = findParam(page.Params, substringFrom(fieldRaw.trim(), "params.".length));
    if (parameter !== undefined) return paramToTemplateValue(parameter);
  }
  throw createTsumoError(
    "TSUMO_TEMPLATE_PAGE_GROUP_FIELD_UNSUPPORTED",
    `Pages.GroupBy cannot resolve page field '${fieldRaw}'`,
  );
};

const groupPagesByField = (pages: PageContext[], field: string, ascending: boolean): AnyArrayValue => {
  const groups: PageGroupBuild[] = [];
  for (let pageIndex: int32 = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!;
    const key = pageGroupingValue(page, field);
    let selected: PageGroupBuild | undefined = undefined;
    for (let groupIndex: int32 = 0; groupIndex < groups.length; groupIndex++) {
      if (compareValues(groups[groupIndex]!.key, key) === 0) {
        selected = groups[groupIndex]!;
        break;
      }
    }
    if (selected === undefined) {
      selected = new PageGroupBuild(key);
      groups.push(selected);
    }
    selected.pages.push(page);
  }
  for (let left: int32 = 0; left < groups.length; left++) {
    for (let right: int32 = left + 1; right < groups.length; right++) {
      const comparison = compareValues(groups[left]!.key, groups[right]!.key);
      if ((ascending && comparison <= 0) || (!ascending && comparison >= 0)) continue;
      const temporary = groups[left]!;
      groups[left] = groups[right]!;
      groups[right] = temporary;
    }
  }
  const result: TemplateValue[] = [];
  for (let index: int32 = 0; index < groups.length; index++) {
    const group = groups[index]!;
    result.push(new PageGroupValue(group.key, group.pages));
  }
  return new AnyArrayValue(result);
};

export const callPageCollectionMethod = (
  collection: PageArrayValue,
  method: string,
  args: TemplateValue[],
): TemplateValue | undefined => {
  if ((method === "first" || method === "limit") && args.length >= 1) {
    const count = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
    const result: PageContext[] = [];
    for (let index = 0; index < collection.value.length && index < count; index++) result.push(collection.value[index]!);
    return new PageArrayValue(result);
  }
  if (method === "groupby" && args.length >= 1) {
    const order = args.length >= 2 ? toPlainString(args[1]!).trim().toLowerCase() : "asc";
    if (order !== "asc" && order !== "desc") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_PAGE_GROUP_ORDER_INVALID",
        `Page group order must be 'asc' or 'desc', received '${order}'`,
      );
    }
    return groupPagesByField(collection.value, toPlainString(args[0]!), order === "asc");
  }
  if (method === "groupbydate" && args.length >= 1) {
    const order = args.length >= 2 ? toPlainString(args[1]!).trim().toLowerCase() : "desc";
    if (order !== "asc" && order !== "desc") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_PAGE_GROUP_ORDER_INVALID",
        `Page date group order must be 'asc' or 'desc', received '${order}'`,
      );
    }
    return groupPagesByDate(collection.value, toPlainString(args[0]!), order === "asc");
  }
  if (method === "related" && args.length === 1) {
    const source = args[0]!;
    if (source instanceof PageValue) return defaultRelatedPages(collection.value, (source as PageValue).value);
    if (source instanceof DictValue) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_RELATED_OPTIONS_UNSUPPORTED",
        "Page collection Related options require a configured related-content model",
      );
    }
  }
  return undefined;
};

const pageDateMilliseconds = (page: PageContext): number => {
  const parsed = Date.parse(page.date);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const groupPagesByDate = (
  pages: PageContext[],
  layout: string,
  ascending: boolean,
): AnyArrayValue => {
  const ordered = copyPageArray(pages);
  for (let left = 0; left < ordered.length; left++) {
    for (let right = left + 1; right < ordered.length; right++) {
      const leftDate = pageDateMilliseconds(ordered[left]!);
      const rightDate = pageDateMilliseconds(ordered[right]!);
      const swap = ascending ? leftDate > rightDate : leftDate < rightDate;
      if (!swap) continue;
      const temporary = ordered[left]!;
      ordered[left] = ordered[right]!;
      ordered[right] = temporary;
    }
  }

  const groups = new Map<string, PageContext[]>();
  const keys: string[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const page = ordered[index]!;
    const key = formatPageDate(page.date, layout);
    if (key === undefined) continue;
    let group = groups.get(key);
    if (group === undefined) {
      group = [];
      groups.set(key, group);
      keys.push(key);
    }
    group.push(page);
  }

  const result: TemplateValue[] = [];
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!;
    const group = groups.get(key);
    if (group === undefined) continue;
    result.push(new PageGroupValue(new StringValue(key), group));
  }
  return new AnyArrayValue(result);
};

const formatPageDate = (value: string, layout: string): string | undefined =>
  formatDateTime(value, layout);

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

export const compareValues = (a: TemplateValue, b: TemplateValue): int32 => {
  // Compare strings
  if (a instanceof StringValue && b instanceof StringValue) {
    const aStr = (a as StringValue).value;
    const bStr = (b as StringValue).value;
    return compareText(aStr, bStr);
  }
  // Compare numbers
  if (a instanceof NumberValue && b instanceof NumberValue) {
    const aNum: int32 = (a as NumberValue).value;
    const bNum: int32 = (b as NumberValue).value;
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

  throw createTsumoError(
    "TSUMO_TEMPLATE_WHERE_OPERATOR_UNSUPPORTED",
    `collections.Where does not support operator '${op}'`,
  );
};
