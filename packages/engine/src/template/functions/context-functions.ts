import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { Environment, Exception } from "@tsonic/dotnet/System.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import type { int } from "@tsonic/csharp/types.js";
import { HtmlString } from "../../utils/html.js";
import { replaceText, substringCount, substringFrom } from "../../utils/strings.js";
import { renderMarkdownWithShortcodes } from "../../markdown.js";
import { ParamKind } from "../../params.js";
import { Resource, ResourceData } from "../../resources.js";
import {
  AnyArrayValue, BoolValue, HtmlValue, MenuEntryValue, NumberValue,
  OutputFormatValue, OutputFormatsValue, PageResourcesValue, PageValue, ResourceValue,
  ScratchValue, SiteValue, StringValue, TemplateValue,
  VersionStringValue,
} from "../values.js";
import { ShortcodeValue } from "../contexts.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { evalToken } from "../evaluation/expression-semantics.js";
import { globMatch, normalizeRelPath, resolvePageRef, tryGetPage } from "../evaluation/path-semantics.js";
import { getSiteStore } from "../evaluation/property-semantics.js";
import { trimEndCharacter, trimSlashes } from "../evaluation/serialization.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";

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
    try {
      store.setInMap(mapName, key, value);
    } catch (e) {
      throw new Exception(`site.Store.SetInMap failed (map=${mapName}, key=${key}): ${e}`);
    }
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

  let receiverToken: string | undefined = undefined;
  let methodName: string | undefined = undefined;
  if (lastDot > 0) {
    if (startsWithDot || startsWithDollar || startsWithSite) {
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

    if (receiverValue instanceof PageResourcesValue) {
      const resources = receiverValue as PageResourcesValue;
      const mgr = resources.manager;
      const page = resources.page;

      if (method === "get" && args.length >= 1) {
        const pageFile = page.File;
        if (pageFile === undefined) return nil;
        const raw = toPlainString(args[0]!);
        const normalized = normalizeRelPath(raw);
        if (normalized === "") return nil;

        const pageDir = Path.GetDirectoryName(pageFile.Filename);
        if (pageDir === undefined || pageDir.trim() === "") return nil;

        const pageDirFull = Path.GetFullPath(pageDir);
        const dirSeparator = `${Path.DirectorySeparatorChar}`;
        const pagePrefix = pageDirFull.endsWith(dirSeparator) ? pageDirFull : pageDirFull + dirSeparator;
        const slash = "/";
        const osRel = replaceText(
          normalized,
          slash,
          dirSeparator
        );
        const candidate = Path.GetFullPath(Path.Combine(pageDirFull, osRel));
        if (!candidate.startsWith(pagePrefix) || !File.Exists(candidate)) return nil;

        const bytes = readFileSync(candidate);
        const ext = (Path.GetExtension(candidate) ?? "").toLowerCase();
        const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
        const text = isText ? bytes.toString("utf8") : undefined;

        const base = trimSlashes(page.relPermalink);
        const outRel = base === "" ? normalized : trimEndCharacter(base, "/") + "/" + normalized;
        const id = `pageRes:${page.relPermalink}:${normalized}`;
        const res = new Resource(id, candidate, true, outRel, bytes, text, new ResourceData(""));
        return new ResourceValue(mgr, res);
      }

      if (method === "getmatch" && args.length >= 1) {
        const pageFile = page.File;
        if (pageFile === undefined) return nil;
        const pattern = toPlainString(args[0]!).trim();
        if (pattern === "") return nil;

        const pageDir = Path.GetDirectoryName(pageFile.Filename);
        if (pageDir === undefined || pageDir.trim() === "") return nil;

        const files = Directory.GetFiles(pageDir, "*", SearchOption.AllDirectories);
        for (let i = 0; i < files.length; i++) {
          const filePath = files[i]!;
          const rel = filePath.length > 0 ? replaceText(Path.GetRelativePath(pageDir, filePath), "\\", "/") : "";
          if (rel === "" || !globMatch(pattern, rel)) continue;

          const bytes = readFileSync(filePath);
          const ext = (Path.GetExtension(filePath) ?? "").toLowerCase();
          const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
          const text = isText ? bytes.toString("utf8") : undefined;

          const base = trimSlashes(page.relPermalink);
          const outRel = base === "" ? rel : trimEndCharacter(base, "/") + "/" + rel;
          const id = `pageRes:${page.relPermalink}:${rel}`;
          const res = new Resource(id, filePath, true, outRel, bytes, text, new ResourceData(""));
          return new ResourceValue(mgr, res);
        }

        return nil;
      }
    }

    if (receiverValue instanceof SiteValue) {
      const site = (receiverValue as SiteValue).value;
      if (method === "getpage" && args.length >= 1) {
        const path = toPlainString(args[0]!);
        const p = tryGetPage(site, path);
        return p !== undefined ? new PageValue(p) : nil;
      }
    }

    if (receiverValue instanceof PageValue) {
      const page = (receiverValue as PageValue).value;

      if (method === "renderstring" && args.length >= 1) {
        const markdown = toPlainString(args[0]!);
        // Use full markdown rendering with shortcodes and render hooks
        const result = renderMarkdownWithShortcodes(markdown, page, scope.site, env);
        return new HtmlValue(new HtmlString(result.html));
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

          let idx: int = -1;
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
  }

  if (name === "return") {
    const v = args.length >= 1 ? args[0]! : nil;
    throw new TemplateReturnSignal(v);
  }

  if (name === "hugo.ismultilingual") return new BoolValue(false);
  if (name === "hugo.ismultihost") return new BoolValue(false);
  if (name === "hugo.workingdir") return new StringValue(Environment.CurrentDirectory);
  // hugo.Version returns a VersionStringValue for semver-like comparison
  // Report a high version to pass theme version gates (e.g., PaperMod requires >= 0.146.0)
  if (name === "hugo.version") return new VersionStringValue("0.146.0");
  // hugo.IsProduction returns true for production builds (default: true)
  if (name === "hugo.isproduction") return new BoolValue(env.isProduction);
  // hugo.IsExtended returns true if extended features (Sass, image processing) are available
  if (name === "hugo.isextended") return new BoolValue(true);
  // hugo.IsServer returns true during hugo server (dev mode)
  if (name === "hugo.isserver") return new BoolValue(!env.isProduction);
  // hugo.IsDevelopment returns true in development mode
  if (name === "hugo.isdevelopment") return new BoolValue(!env.isProduction);

  if (name === "i18n" && args.length >= 1) {
    const key = toPlainString(args[0]!);
    const lang = scope.site.Language.Lang;
    const translated = env.getI18n(lang, key);
    return new StringValue(translated);
  }
  return undefined;
};
