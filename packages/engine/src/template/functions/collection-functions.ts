import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { PageContext } from "../../models.js";
import { codePointAtText, nextCodePointIndex, substringCount, substringFrom } from "../../utils/strings.js";
import {
  AnyArrayValue, BoolValue, DictValue, NumberValue, PageArrayValue, PageValue,
  NilValue, StringArrayValue, StringValue, TemplateValue,
} from "../values.js";
import { compareValues, copyPageArray, matchWhere } from "../evaluation/page-semantics.js";
import { resolvePath } from "../evaluation/property-semantics.js";
import { isTruthy, nil, toNumber, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";
import { createIntegerSequence, reverseTemplateCollection } from "./sequence-semantics.js";

const unionElementsEqual = (left: TemplateValue, right: TemplateValue): boolean | undefined => {
  if (left instanceof NilValue || right instanceof NilValue) {
    return left instanceof NilValue && right instanceof NilValue;
  }
  if (left instanceof StringValue || right instanceof StringValue) {
    if (!(left instanceof StringValue) || !(right instanceof StringValue)) return false;
    return left.value === right.value;
  }
  if (left instanceof NumberValue || right instanceof NumberValue) {
    if (!(left instanceof NumberValue) || !(right instanceof NumberValue)) return false;
    return left.value === right.value;
  }
  if (left instanceof BoolValue || right instanceof BoolValue) {
    if (!(left instanceof BoolValue) || !(right instanceof BoolValue)) return false;
    return left.value === right.value;
  }
  if (left instanceof PageValue || right instanceof PageValue) {
    if (!(left instanceof PageValue) || !(right instanceof PageValue)) return false;
    return left.value === right.value;
  }
  return undefined;
};

const requireElementEquality = (
  left: TemplateValue,
  right: TemplateValue,
  diagnosticCode: string,
  diagnosticMessage: string,
): boolean => {
  const equals = unionElementsEqual(left, right);
  if (equals === undefined) throw createTsumoError(diagnosticCode, diagnosticMessage);
  return equals;
};

const appendUniqueUnionValue = (result: TemplateValue[], candidate: TemplateValue): void => {
  for (let index = 0; index < result.length; index++) {
    if (requireElementEquality(
      result[index]!,
      candidate,
      "TSUMO_TEMPLATE_UNION_ELEMENT_UNSUPPORTED",
      "collections.Union cannot compare values with the supplied element type",
    )) return;
  }
  result.push(candidate);
};

const unionValues = (value: TemplateValue): TemplateValue[] | undefined => {
  if (value instanceof NilValue) return [];
  if (value instanceof AnyArrayValue) return value.value;
  if (value instanceof StringArrayValue) {
    const result: TemplateValue[] = [];
    for (let index = 0; index < value.value.length; index++) result.push(new StringValue(value.value[index]!));
    return result;
  }
  if (value instanceof PageArrayValue) {
    const result: TemplateValue[] = [];
    for (let index = 0; index < value.value.length; index++) result.push(new PageValue(value.value[index]!));
    return result;
  }
  return undefined;
};

const complementContains = (collections: TemplateValue[][], candidate: TemplateValue): boolean => {
  for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
    const collection = collections[collectionIndex]!;
    for (let valueIndex = 0; valueIndex < collection.length; valueIndex++) {
      if (requireElementEquality(
        collection[valueIndex]!,
        candidate,
        "TSUMO_TEMPLATE_COMPLEMENT_ELEMENT_UNSUPPORTED",
        "collections.Complement cannot compare values with the supplied element type",
      )) return true;
    }
  }
  return false;
};

export const callCollectionFunction = (
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  if (name === "seq") return createIntegerSequence(args);

  if (name === "complement" && args.length >= 2) {
    const exclusions: TemplateValue[][] = [];
    for (let index = 0; index < args.length - 1; index++) {
      const values = unionValues(args[index]!);
      if (values === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_COMPLEMENT_COLLECTION_UNSUPPORTED",
          "collections.Complement requires slice arguments",
        );
      }
      exclusions.push(values);
    }
    const source = args[args.length - 1]!;
    const sourceValues = unionValues(source);
    if (sourceValues === undefined) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_COMPLEMENT_COLLECTION_UNSUPPORTED",
        "collections.Complement requires slice arguments",
      );
    }
    if (source instanceof PageArrayValue) {
      const pages: PageContext[] = [];
      for (let index = 0; index < source.value.length; index++) {
        const page = source.value[index]!;
        if (!complementContains(exclusions, new PageValue(page))) pages.push(page);
      }
      return new PageArrayValue(pages);
    }
    if (source instanceof StringArrayValue) {
      const strings: string[] = [];
      for (let index = 0; index < source.value.length; index++) {
        const value = source.value[index]!;
        if (!complementContains(exclusions, new StringValue(value))) strings.push(value);
      }
      return new StringArrayValue(strings);
    }
    const values: TemplateValue[] = [];
    for (let index = 0; index < sourceValues.length; index++) {
      const value = sourceValues[index]!;
      if (!complementContains(exclusions, value)) values.push(value);
    }
    return new AnyArrayValue(values);
  }

  if (name === "where" && (args.length === 3 || args.length === 4)) {
    const collection = args[0]!;
    const path = toPlainString(args[1]!);
    const opRaw = args.length === 3 ? "eq" : toPlainString(args[2]!).toLowerCase();
    const expected = args[args.length - 1]!;
    const empty: string[] = [];
    const segs = path.trim() === "" ? empty : path.split(".");
    if (collection instanceof PageArrayValue) {
      const out: PageContext[] = [];
      for (let i = 0; i < collection.value.length; i++) {
        const page = collection.value[i]!;
        const actual = segs.length === 0 ? new PageValue(page) : resolvePath(new PageValue(page), segs, scope);
        if (matchWhere(actual, opRaw, expected)) out.push(page);
      }
      return new PageArrayValue(out);
    }
    if (collection instanceof AnyArrayValue) {
      const out: TemplateValue[] = [];
      for (let i = 0; i < collection.value.length; i++) {
        const item = collection.value[i]!;
        const actual = segs.length === 0 ? item : resolvePath(item, segs, scope);
        if (matchWhere(actual, opRaw, expected)) out.push(item);
      }
      return new AnyArrayValue(out);
    }
    throw createTsumoError(
      "TSUMO_TEMPLATE_WHERE_COLLECTION_UNSUPPORTED",
      "collections.Where requires a page collection or slice",
    );
  }

  if (name === "sort" && args.length >= 1) {
    const collection = args[0]!;
    const sortKey = args.length >= 2 ? toPlainString(args[1]!) : "";
    const sortOrder = args.length >= 3 ? toPlainString(args[2]!).toLowerCase() : "asc";
    const isDesc = sortOrder === "desc";
    const empty: string[] = [];
    const keySegs = sortKey.trim() === "" ? empty : sortKey.split(".");

    if (collection instanceof PageArrayValue) {
      const arr = copyPageArray(collection.value);
      // Simple bubble sort
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const aVal = keySegs.length === 0 ? new PageValue(arr[i]!) : resolvePath(new PageValue(arr[i]!), keySegs, scope);
          const bVal = keySegs.length === 0 ? new PageValue(arr[j]!) : resolvePath(new PageValue(arr[j]!), keySegs, scope);
          const cmp = compareValues(aVal, bVal);
          const shouldSwap: boolean = isDesc ? cmp < 0 : cmp > 0;
          if (shouldSwap) {
            const tmp = arr[i]!;
            arr[i] = arr[j]!;
            arr[j] = tmp;
          }
        }
      }
      return new PageArrayValue(arr);
    }

    if (collection instanceof AnyArrayValue) {
      const items = collection.value;
      const arr: TemplateValue[] = [];
      for (let i = 0; i < items.length; i++) arr.push(items[i]!);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const aVal = keySegs.length === 0 ? arr[i]! : resolvePath(arr[i]!, keySegs, scope);
          const bVal = keySegs.length === 0 ? arr[j]! : resolvePath(arr[j]!, keySegs, scope);
          const cmp = compareValues(aVal, bVal);
          const shouldSwap: boolean = isDesc ? cmp < 0 : cmp > 0;
          if (shouldSwap) {
            const tmp = arr[i]!;
            arr[i] = arr[j]!;
            arr[j] = tmp;
          }
        }
      }
      return new AnyArrayValue(arr);
    }

    return collection;
  }

  if (name === "after" && args.length >= 2) {
    const n = toNumber(args[0]!);
    const collection = args[1]!;

    if (collection instanceof PageArrayValue) {
      const pages = copyPageArray(collection.value);
      const result: PageContext[] = [];
      for (let i = n; i < pages.length; i++) result.push(pages[i]!);
      return new PageArrayValue(result);
    }

    if (collection instanceof AnyArrayValue) {
      const items = collection.value;
      const result: TemplateValue[] = [];
      for (let i = n; i < items.length; i++) result.push(items[i]!);
      return new AnyArrayValue(result);
    }

    return nil;
  }

  if (name === "first" && args.length >= 2) {
    const count = toNumber(args[0]!);
    const collection = args[1]!;
    if (count < 0) return nil;

    if (collection instanceof PageArrayValue) {
      const result: PageContext[] = [];
      const length = collection.value.length as int32;
      const limit: int32 = count < length ? count : length;
      for (let i = 0; i < limit; i++) result.push(collection.value[i]!);
      return new PageArrayValue(result);
    }

    if (collection instanceof AnyArrayValue) {
      const result: TemplateValue[] = [];
      const length = collection.value.length as int32;
      const limit: int32 = count < length ? count : length;
      for (let i = 0; i < limit; i++) result.push(collection.value[i]!);
      return new AnyArrayValue(result);
    }

    if (collection instanceof StringArrayValue) {
      const result: string[] = [];
      const length = collection.value.length as int32;
      const limit: int32 = count < length ? count : length;
      for (let i = 0; i < limit; i++) result.push(collection.value[i]!);
      return new StringArrayValue(result);
    }

    return nil;
  }

  if (name === "last" && args.length >= 2) {
    const n = toNumber(args[0]!);
    const collection = args[1]!;

    if (collection instanceof PageArrayValue) {
      const pages = copyPageArray(collection.value);
      const start: int32 = pages.length > n ? pages.length - n : 0;
      const result: PageContext[] = [];
      for (let i = start; i < pages.length; i++) result.push(pages[i]!);
      return new PageArrayValue(result);
    }

    if (collection instanceof AnyArrayValue) {
      const items = collection.value;
      const start: int32 = items.length > n ? items.length - n : 0;
      const result: TemplateValue[] = [];
      for (let i = start; i < items.length; i++) result.push(items[i]!);
      return new AnyArrayValue(result);
    }

    return nil;
  }

  if (name === "uniq" && args.length >= 1) {
    const collection = args[0]!;

    if (collection instanceof PageArrayValue) {
      const pages = copyPageArray(collection.value);
      const seen = new Map<string, boolean>();
      const uniqResult: PageContext[] = [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]!;
        const key = p.relPermalink;
        if (!seen.has(key)) {
          seen.set(key, true);
          uniqResult.push(p);
        }
      }
      return new PageArrayValue(uniqResult);
    }

    if (collection instanceof AnyArrayValue) {
      const items = collection.value;
      const seen = new Map<string, boolean>();
      const uniqResult: TemplateValue[] = [];
      for (let i = 0; i < items.length; i++) {
        const key = toPlainString(items[i]!);
        if (!seen.has(key)) {
          seen.set(key, true);
          uniqResult.push(items[i]!);
        }
      }
      return new AnyArrayValue(uniqResult);
    }

    return collection;
  }

  if (name === "union" && args.length >= 2) {
    const first = args[0]!;
    const second = args[1]!;
    if (first instanceof PageArrayValue && second instanceof PageArrayValue) {
      const result = copyPageArray(first.value);
      for (let index = 0; index < second.value.length; index++) {
        const candidate = second.value[index]!;
        let present = false;
        for (let resultIndex = 0; resultIndex < result.length; resultIndex++) {
          if (result[resultIndex] === candidate) {
            present = true;
            break;
          }
        }
        if (!present) result.push(candidate);
      }
      return new PageArrayValue(result);
    }
    if (first instanceof StringArrayValue && second instanceof StringArrayValue) {
      const result: string[] = [];
      for (let index = 0; index < first.value.length; index++) {
        if (!result.includes(first.value[index]!)) result.push(first.value[index]!);
      }
      for (let index = 0; index < second.value.length; index++) {
        if (!result.includes(second.value[index]!)) result.push(second.value[index]!);
      }
      return new StringArrayValue(result);
    }
    if (first instanceof NilValue && second instanceof PageArrayValue) return new PageArrayValue(copyPageArray(second.value));
    if (second instanceof NilValue && first instanceof PageArrayValue) return new PageArrayValue(copyPageArray(first.value));
    if (first instanceof NilValue && second instanceof StringArrayValue) return new StringArrayValue(second.value.slice());
    if (second instanceof NilValue && first instanceof StringArrayValue) return new StringArrayValue(first.value.slice());
    const firstValues = unionValues(first);
    const secondValues = unionValues(second);
    if (firstValues !== undefined && secondValues !== undefined) {
      const result: TemplateValue[] = [];
      for (let index = 0; index < firstValues.length; index++) appendUniqueUnionValue(result, firstValues[index]!);
      for (let index = 0; index < secondValues.length; index++) appendUniqueUnionValue(result, secondValues[index]!);
      return new AnyArrayValue(result);
    }
    throw createTsumoError(
      "TSUMO_TEMPLATE_UNION_COLLECTIONS_INVALID",
      "collections.Union requires two slices or nil values",
    );
  }

  if (name === "group" && args.length >= 2) {
    const key = toPlainString(args[0]!);
    const collection = args[1]!;
    const empty: string[] = [];
    const keySegs = key.trim() === "" ? empty : key.split(".");

    if (collection instanceof PageArrayValue) {
      const pages = copyPageArray(collection.value);
      const groups = new Map<string, PageContext[]>();
      const groupOrder: string[] = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!;
        const val = resolvePath(new PageValue(page), keySegs, scope);
        const groupKey = toPlainString(val);

        let group = groups.get(groupKey);
        if (group === undefined) {
          group = [];
          groups.set(groupKey, group);
          groupOrder.push(groupKey);
        }
        group.push(page);
      }

      const groupResult: TemplateValue[] = [];
      const keys = groupOrder;
      for (let i = 0; i < keys.length; i++) {
        const group = groups.get(keys[i]!);
        if (group === undefined) continue;
        const groupDict = new Map<string, TemplateValue>();
        groupDict.set("Key", new StringValue(keys[i]!));
        groupDict.set("Pages", new PageArrayValue(group));
        groupResult.push(new DictValue(groupDict));
      }
      return new AnyArrayValue(groupResult);
    }

    return nil;
  }

  if (name === "plainify" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    // Deterministic markup stripping for Tsumo's plainify subset.
    const sb = new StringBuilder();
    let inTag = false;
    for (let i: int32 = 0; i < s.length; i = nextCodePointIndex(s, i)) {
      const ch = codePointAtText(s, i);
      if (ch === "<") {
        inTag = true;
        continue;
      }
      if (ch === ">") {
        inTag = false;
        continue;
      }
      if (!inTag) sb.Append(ch);
    }
    return new StringValue(sb.ToString());
  }

  if (name === "cond" && args.length >= 3) {
    return isTruthy(args[0]!) ? args[1]! : args[2]!;
  }

  if (name === "dict") {
    const map = new Map<string, TemplateValue>();
    for (let i = 0; i + 1 < args.length; i += 2) {
      const k = toPlainString(args[i]!);
      map.set(k, args[i + 1]!);
    }
    return new DictValue(map);
  }

  if (name === "slice") {
    const items: TemplateValue[] = [];
    for (let i = 0; i < args.length; i++) items.push(args[i]!);
    return new AnyArrayValue(items);
  }

  if (name === "reverse" && args.length >= 1) {
    return reverseTemplateCollection(args[0]!);
  }

  if (name === "append" && args.length >= 2) {
    const listValue = args[args.length - 1]!;
    const items: TemplateValue[] = [];
    if (listValue instanceof AnyArrayValue) {
      for (let i = 0; i < listValue.value.length; i++) items.push(listValue.value[i]!);
    } else {
      items.push(listValue);
    }

    for (let i = 0; i < args.length - 1; i++) {
      const v = args[i]!;
      if (v instanceof AnyArrayValue) {
        for (let j = 0; j < v.value.length; j++) items.push(v.value[j]!);
      } else {
        items.push(v);
      }
    }
    return new AnyArrayValue(items);
  }

  if (name === "merge" && args.length >= 2) {
    const a = args[0]!;
    const b = args[1]!;
    const merged = new Map<string, TemplateValue>();
    if (a instanceof DictValue) {
      for (const k of a.value.keys()) {
        const v = a.value.get(k);
        if (v === undefined) continue;
        merged.set(k, v);
      }
    }
    if (b instanceof DictValue) {
      for (const k of b.value.keys()) {
        const v = b.value.get(k);
        if (v === undefined) continue;
        merged.set(k, v);
      }
    }
    return new DictValue(merged);
  }

  if (name === "isset" && args.length >= 2) {
    const container = args[0]!;
    const key = toPlainString(args[1]!);
    if (container instanceof DictValue) {
      return new BoolValue(container.value.has(key));
    }
    return new BoolValue(false);
  }

  if (name === "index" && args.length >= 2) {
    const container = args[0]!;
    const keyValue = args[1]!;
    if (container instanceof DictValue) {
      const key = toPlainString(keyValue);
      const v = container.value.get(key);
      return v !== undefined ? v : nil;
    }
    if (container instanceof StringArrayValue && keyValue instanceof NumberValue) {
      const index = keyValue.value;
      if (index < 0 || index >= container.value.length) return nil;
      return new StringValue(container.value[index]!);
    }
    if (container instanceof AnyArrayValue) {
      if (keyValue instanceof NumberValue) {
        const idx = (keyValue as NumberValue).value;
        if (idx < 0 || idx >= container.value.length) return nil;
        return container.value[idx]!;
      }
    }
    if (container instanceof PageArrayValue) {
      if (keyValue instanceof NumberValue) {
        const idx = (keyValue as NumberValue).value;
        return idx >= 0 && idx < container.value.length ? new PageValue(container.value[idx]!) : nil;
      }
    }
    return nil;
  }

  if (name === "delimit" && args.length >= 2) {
    const listValue = args[0]!;
    const delim = toPlainString(args[1]!);
    const parts: string[] = [];
    if (listValue instanceof AnyArrayValue) {
      for (let i = 0; i < listValue.value.length; i++) parts.push(toPlainString(listValue.value[i]!));
    } else if (listValue instanceof StringArrayValue) {
      for (let i = 0; i < listValue.value.length; i++) parts.push(listValue.value[i]!);
    }
    const arr = parts;
    let out = "";
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) out += delim;
      out += arr[i]!;
    }
    return new StringValue(out);
  }

  if (name === "in" && args.length >= 2) {
    const container = args[0]!;
    const needle = toPlainString(args[1]!);
    if (container instanceof AnyArrayValue) {
      for (let i = 0; i < container.value.length; i++) {
        if (toPlainString(container.value[i]!) === needle) return new BoolValue(true);
      }
      return new BoolValue(false);
    }
    if (container instanceof StringValue) {
      return new BoolValue(container.value.includes(needle));
    }
    return new BoolValue(false);
  }

  if (name === "split" && args.length >= 2) {
    const s = toPlainString(args[0]!);
    const delim = toPlainString(args[1]!);
    const items: TemplateValue[] = [];
    if (delim === "") {
      for (let i = 0; i < s.length; i++) items.push(new StringValue(substringCount(s, i, 1)));
      return new AnyArrayValue(items);
    }

    let start = 0;
    while (true) {
      const idx = s.indexOf(delim, start);
      if (idx < 0) break;
      items.push(new StringValue(substringCount(s, start, idx - start)));
      start = idx + delim.length;
    }
    items.push(new StringValue(substringFrom(s, start)));
    return new AnyArrayValue(items);
  }
  return undefined;
};
