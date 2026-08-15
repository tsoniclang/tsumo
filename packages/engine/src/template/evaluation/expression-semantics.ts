import { Int32 } from "@tsonic/dotnet/System.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { substringFrom } from "../../utils/strings.js";
import type { TemplateEnvironment } from "../environment.js";
import type { TemplateNode } from "../nodes.js";
import { parseStringLiteral } from "../parser/tokens.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import type { RenderScope } from "../scope.js";
import {
  AnyArrayValue, BoolValue, NumberValue, PageArrayValue, PageResourcesValue, PageValue,
  ResourceValue, SitesArrayValue, SitesValue, SiteValue, StringValue, TemplateValue,
} from "../values.js";
import {
  callPageResourceCollectionMethod,
  callPageResourcesMethod,
  PageResourceCollectionValue,
} from "./page-resource-semantics.js";
import { callPageCollectionMethod, getPageTerms } from "./page-semantics.js";
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
  if (t === "hugo.Sites") return new SitesArrayValue(scope.site.Sites);
  if (t.startsWith("hugo.Sites.")) {
    const segs = substringFrom(t, 11).split(".");
    return resolvePath(new SitesValue(scope.site), segs, scope);
  }
  if (t === "page") {
    const page = scope.state.currentPage;
    return page === undefined ? nil : new PageValue(page);
  }
  if (t.startsWith("page.")) {
    const page = scope.state.currentPage;
    if (page === undefined) return nil;
    const segs = substringFrom(t, 5).split(".");
    return resolvePath(new PageValue(page), segs, scope);
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

  if (receiver instanceof PageResourcesValue) {
    const pageResources = receiver as PageResourcesValue;
    const result = callPageResourcesMethod(pageResources, method, args);
    if (result !== undefined) return result;
  }

  if (receiver instanceof PageResourceCollectionValue) {
    const pageResources = receiver as PageResourceCollectionValue;
    const result = callPageResourceCollectionMethod(pageResources, method, args);
    if (result !== undefined) return result;
  }

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
    const result = callPageCollectionMethod(receiver as PageArrayValue, method, args);
    if (result !== undefined) return result;
  }

  // Handle PageValue methods
  if (receiver instanceof PageValue) {
    const page = receiver.value;

    if (method === "getterms" && args.length >= 1) {
      return getPageTerms(page, toPlainString(args[0]!));
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
