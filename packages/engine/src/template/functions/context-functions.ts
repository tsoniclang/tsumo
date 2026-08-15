import { Environment } from "@tsonic/dotnet/System.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { HtmlString } from "../../utils/html.js";
import { substringCount, substringFrom } from "../../utils/strings.js";
import { renderMarkdownWithShortcodes } from "../../markdown.js";
import { parseInt32 } from "../../utils/int32.js";
import { ParamKind } from "../../params.js";
import {
  AnyArrayValue, BoolValue, DateValue, HtmlValue, MenuEntryValue, NumberValue,
  OutputFormatValue, OutputFormatsValue, PageArrayValue, PageResourcesValue, PageValue, PaginatorValue,
  ScratchValue, SiteValue, StringValue, TemplateValue,
  VersionStringValue,
} from "../values.js";
import { ShortcodeValue } from "../contexts.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { evalToken } from "../evaluation/expression-semantics.js";
import {
  callPageResourceCollectionMethod,
  callPageResourcesMethod,
  PageResourceCollectionValue,
} from "../evaluation/page-resource-semantics.js";
import { formatDateTime } from "../evaluation/scalar-semantics.js";
import { callPageCollectionMethod, getPageTerms, toPages } from "../evaluation/page-semantics.js";
import { resolvePageRef, tryGetPage } from "../evaluation/path-semantics.js";
import { getSiteStore } from "../evaluation/property-support.js";
import { findParam, paramToTemplateValue } from "../evaluation/param-semantics.js";
import { trimEndCharacter } from "../evaluation/serialization.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";

const hugoCompatibilityVersion = "0.146.0";

export const callContextFunction = (
  nameRaw: string,
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  const env = context.environment;
  const overrides = context.overrides;
  if (name === "site.store.get" && args.length >= 1) {
    const store = getSiteStore(scope.site);
    return store.get(toPlainString(args[0]!));
  }
  if (name === "site.store.set" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.set(toPlainString(args[0]!), args[1]!);
    return nil;
  }
  if (name === "site.store.add" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.add(toPlainString(args[0]!), args[1]!);
    return nil;
  }
  if (name === "site.store.delete" && args.length >= 1) {
    const store = getSiteStore(scope.site);
    store.delete(toPlainString(args[0]!));
    return nil;
  }
  if (name === "site.store.setinmap" && args.length >= 3) {
    const store = getSiteStore(scope.site);
    const mapName = toPlainString(args[0]!);
    const key = toPlainString(args[1]!);
    const value = args[2]!;
    store.setInMap(mapName, key, value);
    return nil;
  }
  if (name === "site.store.deleteinmap" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.deleteInMap(toPlainString(args[0]!), toPlainString(args[1]!));
    return nil;
  }

  const trimmedName = nameRaw.trim();
  const lastDot = trimmedName.lastIndexOf(".");
  const lowerName = trimmedName.toLowerCase();
  const startsWithDot = trimmedName.startsWith(".");
  const startsWithDollar = trimmedName.startsWith("$");
  const startsWithSite = lowerName.startsWith("site.");
  const startsWithPage = lowerName.startsWith("page.");

  let receiverToken: string | undefined = undefined;
  let methodName: string | undefined = undefined;
  if (lastDot > 0) {
    if (startsWithDot || startsWithDollar || startsWithSite || startsWithPage) {
      receiverToken = substringCount(trimmedName, 0, lastDot);
      methodName = substringFrom(trimmedName, lastDot + 1).trim();
    }
  } else if (startsWithDot && lastDot === 0) {
    receiverToken = ".";
    methodName = substringFrom(trimmedName, 1).trim();
  }

  if (receiverToken !== undefined && methodName !== undefined && methodName.trim() !== "") {
    const method = methodName.toLowerCase();
    const receiverValue = evalToken(receiverToken, scope);

    if (receiverValue instanceof ScratchValue) {
      const scratch = receiverValue as ScratchValue;
      const store = scratch.value;
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

    if (receiverValue instanceof DateValue) {
      if (method === "format" && args.length >= 1) {
        return new StringValue(formatDateTime(receiverValue.value, toPlainString(args[0]!)) ?? "");
      }
    }

    if (receiverValue instanceof PageResourcesValue) {
      const resources = receiverValue as PageResourcesValue;
      const result = callPageResourcesMethod(resources, method, args);
      if (result !== undefined) return result;
    }

    if (receiverValue instanceof PageResourceCollectionValue) {
      const resources = receiverValue as PageResourceCollectionValue;
      const result = callPageResourceCollectionMethod(resources, method, args);
      if (result !== undefined) return result;
    }

    if (receiverValue instanceof SiteValue) {
      const site = (receiverValue as SiteValue).value;
      if (method === "param" && args.length >= 1) {
        const selected = findParam(site.Params, toPlainString(args[0]!));
        return selected !== undefined ? paramToTemplateValue(selected) : nil;
      }
      if (method === "getpage" && args.length >= 1) {
        const path = toPlainString(args[0]!);
        const p = tryGetPage(site, path);
        return p !== undefined ? new PageValue(p) : nil;
      }
    }

    if (receiverValue instanceof PageValue) {
      const page = (receiverValue as PageValue).value;

      if (method === "getterms" && args.length >= 1) {
        return getPageTerms(page, toPlainString(args[0]!));
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
        const markdown = toPlainString(args[0]!);
        // Use full markdown rendering with shortcodes and render hooks
        const result = renderMarkdownWithShortcodes(markdown, page, scope.site, env);
        return new HtmlValue(new HtmlString(result.html));
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
        const raw = toPlainString(args[0]!);
        const resolved = resolvePageRef(page, raw);
        const found = tryGetPage(page.site, resolved);
        return found !== undefined ? new PageValue(found) : nil;
      }

      if (method === "isancestor" && args.length >= 1) {
        const otherValue = args[0]!;
        if (otherValue instanceof PageValue) {
          const other = (otherValue as PageValue).value;
          const ancestors = other.ancestors;
          for (let i = 0; i < ancestors.length; i++) {
            if (ancestors[i] === page) return new BoolValue(true);
          }
          const base = trimEndCharacter(page.relPermalink, "/");
          const child = trimEndCharacter(other.relPermalink, "/");
          return new BoolValue(child.startsWith(base) && child !== base);
        }
        return new BoolValue(false);
      }

      if (method === "ismenucurrent" && args.length >= 2) {
        const menuNameArg = args[0]!;
        const entryArg = args[1]!;
        if (entryArg instanceof MenuEntryValue) {
          const entry = (entryArg as MenuEntryValue).value;
          const entryPage = entry.page;
          const entryUrl = entry.url !== "" ? entry.url : entryPage !== undefined ? entryPage.relPermalink : "";
          const pagePermalink = trimEndCharacter(page.relPermalink, "/");
          const entryUrlNormalized = trimEndCharacter(entryUrl, "/");
          if (pagePermalink === entryUrlNormalized) return new BoolValue(true);
          if (entryPage !== undefined && entryPage === page) return new BoolValue(true);
        }
        return new BoolValue(false);
      }
    }

    if (receiverValue instanceof OutputFormatsValue) {
      const site = (receiverValue as OutputFormatsValue).site;
      if (method === "get" && args.length >= 1) {
        const formatName = toPlainString(args[0]!).toLowerCase();
        const formats = site.getOutputFormats();
        for (let i = 0; i < formats.length; i++) {
          const fmt = formats[i]!;
          if (fmt.Rel.toLowerCase() === formatName || formatName === "rss") {
            return new OutputFormatValue(fmt);
          }
        }
        return nil;
      }
    }

    if (receiverValue instanceof ShortcodeValue) {
      const sc = (receiverValue as ShortcodeValue).value;
      if (method === "get" && args.length >= 1) {
        const keyOrIndex = toPlainString(args[0]!);
        const pv = sc.Get(keyOrIndex);
        if (pv === undefined) return nil;
        const kind = pv.kind;
        if (kind === ParamKind.Bool) return new BoolValue(pv.boolValue);
        if (kind === ParamKind.Number) return new NumberValue(pv.numberValue);
        return new StringValue(pv.stringValue);
      }
    }

    if (receiverValue instanceof AnyArrayValue) {
      const items = receiverValue.value;

      if ((method === "next" || method === "prev") && args.length >= 1) {
        const target = args[0]!;
        if (target instanceof PageValue) {
          const targetPage = (target as PageValue).value;
          const vals = items;

          let idx: int32 = -1;
          for (let i = 0; i < vals.length; i++) {
            const cur = vals[i]!;
            if (cur instanceof PageValue && (cur as PageValue).value === targetPage) {
              idx = i;
              break;
            }
          }
          if (idx < 0) return nil;
          const nextIndex = method === "next" ? idx + 1 : idx - 1;
          if (nextIndex < 0 || nextIndex >= vals.length) return nil;
          return vals[nextIndex]!;
        }
      }
    }

    if (receiverValue instanceof PageArrayValue) {
      const result = callPageCollectionMethod(receiverValue as PageArrayValue, method, args);
      if (result !== undefined) return result;
    }
  }

  if (name === "return") {
    const v = args.length >= 1 ? args[0]! : nil;
    throw new TemplateReturnSignal(v);
  }

  if (name === "hugo.ismultilingual") return new BoolValue(false);
  if (name === "hugo.ismultihost") return new BoolValue(false);
  if (name === "hugo.workingdir") return new StringValue(Environment.CurrentDirectory);
  if (name === "hugo.version") return new VersionStringValue(hugoCompatibilityVersion);
  if (name === "hugo.generator") {
    return new HtmlValue(new HtmlString(`<meta name="generator" content="Hugo ${hugoCompatibilityVersion}">`));
  }
  // hugo.IsProduction returns true for production builds (default: true)
  if (name === "hugo.isproduction") return new BoolValue(env.isProduction);
  // hugo.IsExtended returns true if extended features (Sass, image processing) are available
  if (name === "hugo.isextended") return new BoolValue(true);
  // hugo.IsServer returns true during hugo server (dev mode)
  if (name === "hugo.isserver") return new BoolValue(!env.isProduction);
  // hugo.IsDevelopment returns true in development mode
  if (name === "hugo.isdevelopment") return new BoolValue(!env.isProduction);
  if (name === "hugo.environment") return new StringValue(env.isProduction ? "production" : "development");
  if (name === "now.year") {
    const year = parseInt32(substringCount(env.buildTime.toISOString(), 0, 4));
    return new NumberValue(year ?? 0);
  }
  if (name === "now.format" && args.length >= 1) {
    const rendered = formatDateTime(env.buildTime.toISOString(), toPlainString(args[0]!));
    return rendered !== undefined ? new StringValue(rendered) : nil;
  }
  if (name === "getenv" && args.length >= 1) {
    const value = env.getEnvironmentVariable(toPlainString(args[0]!));
    return value !== undefined ? new StringValue(value) : new StringValue("");
  }

  if (name === "i18n" && args.length >= 1) {
    const key = toPlainString(args[0]!);
    const lang = scope.site.Language.Lang;
    const translated = env.getI18n(lang, key);
    return new StringValue(translated);
  }
  return undefined;
};
