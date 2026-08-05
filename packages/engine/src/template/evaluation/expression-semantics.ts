import { Int32 } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/csharp/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { PageContext } from "../../models.js";
import { substringFrom } from "../../utils/strings.js";
import type { TemplateEnvironment } from "../environment.js";
import type { TemplateNode } from "../nodes.js";
import { parseStringLiteral } from "../parser/tokens.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import type { RenderScope } from "../scope.js";
import {
  AnyArrayValue, BoolValue, NumberValue, PageArrayValue, PageValue,
  ResourceValue, SiteValue, StringValue, TemplateValue,
} from "../values.js";
import { copyPageArray, copyStringArray } from "./page-semantics.js";
import { globMatch } from "./path-semantics.js";
import { resolvePath } from "./property-semantics.js";
import { isNumberLiteral } from "./scalar-semantics.js";
import { getPathExtension } from "./serialization.js";

export const evalToken = (token: string, scope: RenderScope): TemplateValue => {
  const t = token.trim();
  if (t === ".") return scope.dot;
  if (t === "$") return scope.root;
  if (t.startsWith("$.")) {
    const segs = substringFrom(t, 2).split(".");
    return resolvePath(scope.root, segs, scope);
  }
  if (t.startsWith(".")) {
    const segs = substringFrom(t, 1).split(".");
    return resolvePath(scope.dot, segs, scope);
  }
  if (t.startsWith("$") && t.length > 1) {
    const inner = substringFrom(t, 1);
    const segs = inner.split(".");
    const name = segs.length > 0 ? segs[0]! : inner;
    const value = scope.getVar(name) ?? nil;
    if (segs.length > 1) {
      const rem: string[] = [];
      for (let i = 1; i < segs.length; i++) rem.push(segs[i]!);
      return resolvePath(value, rem, scope);
    }
    return value;
  }
  if (t === "site") return new SiteValue(scope.site);
  if (t.startsWith("site.")) {
    const segs = substringFrom(t, 5).split(".");
    return resolvePath(new SiteValue(scope.site), segs, scope);
  }
  const lit = parseStringLiteral(t);
  if (lit !== undefined) return new StringValue(lit);
  if (t === "true") return new BoolValue(true);
  if (t === "false") return new BoolValue(false);
  if (isNumberLiteral(t)) return new NumberValue(Int32.Parse(t));
  return new StringValue(t);
};

export const callMethod = (
  receiver: TemplateValue,
  methodName: string,
  args: TemplateValue[],
  scope: RenderScope,
  env: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
): TemplateValue => {
  const method = methodName.toLowerCase();

  // Handle AnyArrayValue methods (resource collections, page collections, etc.)
  if (receiver instanceof AnyArrayValue) {
    const arr = receiver.value;

    // GetMatch - find first item matching pattern (for resources)
    if (method === "getmatch" && args.length >= 1) {
      const pattern = toPlainString(args[0]!);
      const items = arr;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item instanceof ResourceValue) {
          const res = item.value;
          const name = res.outputRelPath ?? res.id;
          if (globMatch(pattern, name)) {
            return item;
          }
        }
      }
      return nil;
    }

    // Match - filter items matching pattern
    if (method === "match" && args.length >= 1) {
      const pattern = toPlainString(args[0]!);
      const matchResult: TemplateValue[] = [];
      const items = arr;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item instanceof ResourceValue) {
          const res = item.value;
          const name = res.outputRelPath ?? res.id;
          if (globMatch(pattern, name)) {
            matchResult.push(item);
          }
        }
      }
      return new AnyArrayValue(matchResult);
    }

    // ByType - filter by media type (using path extension as heuristic)
    if (method === "bytype" && args.length >= 1) {
      const targetType = toPlainString(args[0]!).toLowerCase();
      const byTypeResult: TemplateValue[] = [];
      const byTypeItems = arr;
      for (let i = 0; i < byTypeItems.length; i++) {
        const item = byTypeItems[i]!;
        if (item instanceof ResourceValue) {
          const res = item.value;
          const separator = res.mediaType.indexOf("/");
          const mainType = separator >= 0 ? res.mediaType.substring(0, separator).toLowerCase() : "";
          if (mainType === targetType) byTypeResult.push(item);
        }
      }
      return new AnyArrayValue(byTypeResult);
    }
  }

  // Handle PageArrayValue methods
  if (receiver instanceof PageArrayValue) {
    const pageArr = receiver as PageArrayValue;
    const pages: PageContext[] = pageArr.value;

    // First - return first N pages
    if (method === "first" && args.length >= 1) {
      const n = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
      const firstResult: PageContext[] = [];
      for (let i = 0; i < pages.length && i < n; i++) firstResult.push(pages[i]!);
      return new PageArrayValue(firstResult);
    }

    // Limit - same as First
    if (method === "limit" && args.length >= 1) {
      const n = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
      const limitResult: PageContext[] = [];
      for (let i = 0; i < pages.length && i < n; i++) limitResult.push(pages[i]!);
      return new PageArrayValue(limitResult);
    }
  }

  // Handle PageValue methods
  if (receiver instanceof PageValue) {
    const page = receiver.value;

    // GetTerms - return term pages for a taxonomy
    if (method === "getterms" && args.length >= 1) {
      const taxonomy = toPlainString(args[0]!).toLowerCase();
      const site = page.site;
      const termsResult: PageContext[] = [];

      // Get the term values from the page (e.g., tags, categories)
      // Currently only supports built-in tags and categories
      if (taxonomy !== "tags" && taxonomy !== "categories") {
        // Unsupported taxonomy - return empty result
        return new PageArrayValue(termsResult);
      }
      let termValues: string[];
      if (taxonomy === "tags") {
        termValues = copyStringArray(page.tags);
      } else {
        termValues = copyStringArray(page.categories);
      }
      const allPages = copyPageArray(site.allPages);

      // Find the term pages from site taxonomies
      for (let i = 0; i < termValues.length; i++) {
        const termValue = termValues[i]!;
        // Look for the term page in site.allPages
        const termSlug = termValue.toLowerCase().replaceAll(" ", "-");
        for (let j = 0; j < allPages.length; j++) {
          const p = allPages[j]!;
          if (p.kind === "term" && p.section === taxonomy && p.slug === termSlug) {
            termsResult.push(p);
            break;
          }
        }
      }

      return new PageArrayValue(termsResult);
    }
  }

  // Handle ResourceValue methods
  if (receiver instanceof ResourceValue) {
    if (method === "resize" && args.length >= 1) {
      const resized = receiver.manager.resize(
        receiver.value,
        toPlainString(args[0]!),
      );
      return new ResourceValue(receiver.manager, resized);
    }
  }

  throw createTsumoError(
    "TSUMO_TEMPLATE_METHOD_UNKNOWN",
    `Template value does not expose method '${methodName}' for the supplied arguments`,
  );
};
