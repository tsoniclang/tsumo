import { Int32 } from "@tsonic/dotnet/System.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { renderMarkdownWithShortcodes } from "../../markdown.js";
import { ParamKind } from "../../params.js";
import { HtmlString } from "../../utils/html.js";
import { substringFrom } from "../../utils/strings.js";
import { ShortcodeValue } from "../contexts.js";
import type { TemplateEnvironment } from "../environment.js";
import { TemplateFunctionContext } from "../functions/function-context.js";
import { callResourceFunction } from "../functions/resource-functions.js";
import type { TemplateNode } from "../nodes.js";
import { parseStringLiteral } from "../parser/tokens.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import type { RenderScope } from "../scope.js";
import {
  AnyArrayValue, BoolValue, HtmlValue, MenuEntryValue, NumberValue, OutputFormatValue, OutputFormatsValue,
  PageArrayValue, PageResourcesValue, PageValue, PaginatorValue, ResourceNamespaceValue, ResourceValue,
  ScratchValue, SitesArrayValue, SitesValue, SiteValue, StringValue, TemplateValue, UrlQueryValue,
} from "../values.js";
import { callDateMethod } from "./date-semantics.js";
import { hasMenuCurrent, isMenuCurrent } from "./menu-semantics.js";
import { findParam, paramToTemplateValue } from "./param-semantics.js";
import {
  callPageResourceCollectionMethod,
  callPageResourcesMethod,
  PageResourceCollectionValue,
} from "./page-resource-semantics.js";
import { callPageCollectionMethod, getPageTerms, pageHasShortcode, toPages } from "./page-semantics.js";
import { globMatch, resolvePageRef, tryGetPage } from "./path-semantics.js";
import { resolvePath } from "./property-semantics.js";
import { isNumberLiteral } from "./scalar-semantics.js";
import { trimEndCharacter } from "./serialization.js";
import { getUrlQueryValue } from "./url-query-semantics.js";
import { templateValueDiagnosticKind } from "./value-diagnostics.js";

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
  if (t === "hugo.Data") return scope.env.getSiteData();
  if (t.startsWith("hugo.Data.")) {
    const segs = substringFrom(t, "hugo.Data.".length).split(".");
    return resolvePath(scope.env.getSiteData(), segs, scope);
  }
  if (t === "hugo.Store") return new ScratchValue(scope.env.getGlobalStore());
  if (t === "resources") return new ResourceNamespaceValue();
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
  if (t === "nil") return nil;
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

  if (receiver instanceof ResourceNamespaceValue) {
    const result = callResourceFunction(
      `resources.${method}`,
      args,
      new TemplateFunctionContext(scope, env, overrides, defines),
    );
    if (result !== undefined) return result;
  }

  if (receiver instanceof ScratchValue) {
    const store = receiver.value;
    if (method === "get" && args.length >= 1) return store.get(toPlainString(args[0]!));
    if (method === "set" && args.length >= 2) {
      store.set(toPlainString(args[0]!), args[1]!);
      return nil;
    }
    if (method === "add" && args.length >= 2) {
      store.add(toPlainString(args[0]!), args[1]!);
      return nil;
    }
    if (method === "delete" && args.length >= 1) {
      store.delete(toPlainString(args[0]!));
      return nil;
    }
    if (method === "setinmap" && args.length >= 3) {
      store.setInMap(toPlainString(args[0]!), toPlainString(args[1]!), args[2]!);
      return nil;
    }
    if (method === "deleteinmap" && args.length >= 2) {
      store.deleteInMap(toPlainString(args[0]!), toPlainString(args[1]!));
      return nil;
    }
  }

  const dateResult = callDateMethod(receiver, method, args);
  if (dateResult !== undefined) return dateResult;

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

  if (receiver instanceof AnyArrayValue) {
    const arr = receiver.value;

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

    if ((method === "next" || method === "prev") && args.length >= 1) {
      const target = args[0]!;
      if (target instanceof PageValue) {
        const targetPage = target.value;
        let selectedIndex: int32 = -1;
        for (let index = 0; index < arr.length; index++) {
          const current = arr[index]!;
          if (current instanceof PageValue && current.value === targetPage) {
            selectedIndex = index;
            break;
          }
        }
        if (selectedIndex < 0) return nil;
        const adjacentIndex = method === "next" ? selectedIndex + 1 : selectedIndex - 1;
        if (adjacentIndex < 0 || adjacentIndex >= arr.length) return nil;
        return arr[adjacentIndex]!;
      }
    }
  }

  if (receiver instanceof PageArrayValue) {
    const result = callPageCollectionMethod(receiver as PageArrayValue, method, args);
    if (result !== undefined) return result;
  }

  if (receiver instanceof SiteValue) {
    const site = receiver.value;
    if (method === "param" && args.length >= 1) {
      const selected = findParam(site.Params, toPlainString(args[0]!));
      return selected !== undefined ? paramToTemplateValue(selected) : nil;
    }
    if (method === "getpage" && args.length >= 1) {
      const page = tryGetPage(site, toPlainString(args[0]!));
      return page !== undefined ? new PageValue(page) : nil;
    }
  }

  if (receiver instanceof PageValue) {
    const page = receiver.value;
    if (method === "getterms" && args.length >= 1) {
      return getPageTerms(page, toPlainString(args[0]!));
    }
    if (method === "hasshortcode" && args.length === 1) {
      return new BoolValue(pageHasShortcode(page, toPlainString(args[0]!)));
    }
    if (method === "param" && args.length >= 1) {
      const name = toPlainString(args[0]!);
      const selected = findParam(page.Params, name) ?? findParam(page.site.Params, name);
      return selected !== undefined ? paramToTemplateValue(selected) : nil;
    }
    if (method === "paginate" && args.length >= 1) {
      const paginator = new PaginatorValue(
        toPages(args[0]!),
        scope.site.paginationSize,
        scope.state.paginationPageNumber,
        page.relPermalink,
      );
      return scope.selectPaginator(paginator);
    }
    if (method === "renderstring" && args.length >= 1) {
      const rendered = renderMarkdownWithShortcodes(toPlainString(args[0]!), page, scope.site, env);
      return new HtmlValue(new HtmlString(rendered.html));
    }
    if (method === "render" && args.length >= 1) {
      const view = toPlainString(args[0]!);
      const rendered = env.renderPageView(page, view, scope.state);
      if (rendered === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_PAGE_RENDER_MISSING",
          `Page render template '${view}' was not found for type '${page.type}' and section '${page.section}'`,
        );
      }
      return new HtmlValue(new HtmlString(rendered));
    }
    if (method === "getpage" && args.length >= 1) {
      const resolved = resolvePageRef(page, toPlainString(args[0]!));
      const found = tryGetPage(page.site, resolved);
      return found !== undefined ? new PageValue(found) : nil;
    }
    if (method === "isancestor" && args.length >= 1) {
      const otherValue = args[0]!;
      if (!(otherValue instanceof PageValue)) return new BoolValue(false);
      const other = otherValue.value;
      for (let index = 0; index < other.ancestors.length; index++) {
        if (other.ancestors[index] === page) return new BoolValue(true);
      }
      const base = trimEndCharacter(page.relPermalink, "/");
      const child = trimEndCharacter(other.relPermalink, "/");
      return new BoolValue(child.startsWith(base) && child !== base);
    }
    if ((method === "ismenucurrent" || method === "hasmenucurrent") && args.length >= 2) {
      const entryValue = args[1]!;
      if (!(entryValue instanceof MenuEntryValue)) return new BoolValue(false);
      if (entryValue.site !== page.site) return new BoolValue(false);
      const menuName = toPlainString(args[0]!);
      return new BoolValue(method === "ismenucurrent"
        ? isMenuCurrent(page, menuName, entryValue.value)
        : hasMenuCurrent(page, menuName, entryValue.value));
    }
  }

  if (receiver instanceof OutputFormatsValue) {
    if (method === "get" && args.length >= 1) {
      const formatName = toPlainString(args[0]!).toLowerCase();
      const formats = receiver.site.getOutputFormats();
      for (let index = 0; index < formats.length; index++) {
        const format = formats[index]!;
        if (format.Rel.toLowerCase() === formatName || formatName === "rss") {
          return new OutputFormatValue(format);
        }
      }
      return nil;
    }
  }

  if (receiver instanceof ShortcodeValue) {
    if (method === "get" && args.length >= 1) {
      const parameter = receiver.value.Get(toPlainString(args[0]!));
      if (parameter === undefined) return nil;
      if (parameter.kind === ParamKind.Bool) return new BoolValue(parameter.boolValue);
      if (parameter.kind === ParamKind.Number) return new NumberValue(parameter.numberValue);
      return new StringValue(parameter.stringValue);
    }
  }

  if (receiver instanceof UrlQueryValue) {
    if (method === "get" && args.length >= 1) {
      const selected = getUrlQueryValue(receiver.value, toPlainString(args[0]!));
      return selected === undefined ? nil : new StringValue(selected);
    }
  }

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
    `Template ${templateValueDiagnosticKind(receiver)} does not expose method '${methodName}' for the supplied arguments`,
    scope.templateSourcePath,
  );
};
