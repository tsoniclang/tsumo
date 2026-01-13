import { Console, DateTime, Environment, Exception, Int32, Uri, UriKind } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { WebUtility } from "@tsonic/dotnet/System.Net.js";
import { MD5, SHA1 } from "@tsonic/dotnet/System.Security.Cryptography.js";
import { Encoding, StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { Regex } from "@tsonic/dotnet/System.Text.RegularExpressions.js";
import type { byte, char, int } from "@tsonic/core/types.js";
import { HtmlString, escapeHtml } from "../utils/html.ts";
import { indexOfTextFrom, replaceText } from "../utils/strings.ts";
import { ensureTrailingSlash, humanizeSlug, slugify } from "../utils/text.ts";
import { LanguageContext, MediaType, MenuEntry, OutputFormat, PageContext, PageFile, SiteContext } from "../models.ts";
import type { DocsMountContext, NavItem } from "../docs/models.ts";
import { markdownPipeline, renderMarkdown, renderMarkdownWithShortcodes } from "../markdown.ts";
import { ParamKind, ParamValue } from "../params.ts";
import { Resource, ResourceData } from "../resources.ts";
import type { ResourceManager } from "../resources.ts";

import {
  TemplateValue, NilValue, StringValue, BoolValue, NumberValue, HtmlValue,
  PageValue, SiteValue, LanguageValue, FileValue, SitesValue,
  ResourceDataValue, ResourceValue, PageResourcesValue,
  PageArrayValue, StringArrayValue, SitesArrayValue, AnyArrayValue,
  DocsMountValue, DocsMountArrayValue, NavItemValue, NavArrayValue,
  MenuEntryValue, MenuArrayValue, MenusValue,
  OutputFormatsValue, OutputFormatValue, OutputFormatsGetValue,
  TaxonomiesValue, TaxonomyTermsValue, MediaTypeValue,
  DictValue, ScratchStore, ScratchValue, UrlParts, UrlValue,
  VersionStringValue,
} from "./values.ts";
import { ShortcodeContext, ShortcodeValue, LinkHookValue, ImageHookValue, HeadingHookValue } from "./contexts.ts";
import { RenderScope } from "./scope.ts";
import type { TemplateEnvironment } from "./environment.ts";
import { TemplateNode, TextNode, OutputNode, AssignmentNode, TemplateInvokeNode, IfNode, RangeNode, WithNode, BlockNode } from "./nodes.ts";
import { Template } from "./template.ts";

// Segment class for parsing
export class Segment {
  readonly isAction: boolean;
  readonly text: string;

  constructor(isAction: boolean, text: string) {
    this.isAction = isAction;
    this.text = text;
  }
}

export class Pipeline {
  readonly stages: Command[];

  constructor(stages: Command[]) {
    this.stages = stages;
  }

  eval(scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>, defines: Dictionary<string, TemplateNode[]>): TemplateValue {
    if (this.stages.length === 0) return TemplateRuntime.nil;

    let value = this.stages[0]!.eval(scope, env, overrides, defines, undefined);
    for (let i = 1; i < this.stages.length; i++) {
      value = this.stages[i]!.eval(scope, env, overrides, defines, value);
    }
    return value;
  }
}

class TemplateRuntime {
  static readonly nil: TemplateValue = new NilValue();
  static readonly pageStores: Dictionary<PageContext, ScratchStore> = new Dictionary<PageContext, ScratchStore>();
  static readonly siteStores: Dictionary<SiteContext, ScratchStore> = new Dictionary<SiteContext, ScratchStore>();

  static getResourceManager(env: TemplateEnvironment): ResourceManager | undefined {
    return env.getResourceManager();
  }

  static isTruthy(value: TemplateValue): boolean {
    if (value instanceof NilValue) return false;

    if (value instanceof BoolValue) {
      return value.value;
    }

    if (value instanceof NumberValue) {
      return value.value !== 0;
    }

    if (value instanceof StringValue) {
      return value.value !== "";
    }

    if (value instanceof HtmlValue) {
      return value.value.value !== "";
    }

    if (value instanceof DictValue) return value.value.count > 0;
    if (value instanceof PageArrayValue) return value.value.length > 0;
    if (value instanceof StringArrayValue) return value.value.length > 0;
    if (value instanceof SitesArrayValue) return value.value.length > 0;
    if (value instanceof DocsMountArrayValue) return value.value.length > 0;
    if (value instanceof NavArrayValue) return value.value.length > 0;
    if (value instanceof AnyArrayValue) return value.value.count > 0;

    return true;
  }

  static toPlainString(value: TemplateValue): string {
    if (value instanceof StringValue) {
      return value.value;
    }

    if (value instanceof HtmlValue) {
      return value.value.value;
    }

    if (value instanceof BoolValue) {
      return value.value ? "true" : "false";
    }

    if (value instanceof NumberValue) {
      return value.value.toString();
    }

    if (value instanceof PageValue) {
      return value.value.relPermalink;
    }

    if (value instanceof VersionStringValue) {
      return value.value;
    }

    return "";
  }

  static toNumber(value: TemplateValue): int {
    if (value instanceof NumberValue) {
      return value.value;
    }
    if (value instanceof StringValue) {
      let parsed: int = 0;
      if (Int32.tryParse(value.value, parsed)) return parsed;
      return 0;
    }
    if (value instanceof BoolValue) {
      return value.value ? 1 : 0;
    }
    return 0;
  }

  static stringify(value: TemplateValue, escape: boolean): string {
    if (value instanceof NilValue) return "";
    if (value instanceof HtmlValue) {
      return value.value.value;
    }
    if (value instanceof StringValue) {
      const s = value.value;
      return escape ? escapeHtml(s) : s;
    }
    if (value instanceof BoolValue) {
      return value.value ? "true" : "false";
    }
    if (value instanceof NumberValue) {
      return value.value.toString();
    }
    return "";
  }

  static parseStringLiteral(token: string): string | undefined {
    const t = token.trim();
    if (
      t.length >= 2 &&
      ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith("`") && t.endsWith("`")))
    ) {
      return t.substring(1, t.length - 2);
    }
    return undefined;
  }

  static isNumberLiteral(token: string): boolean {
    if (token === "") return false;
    let parsed: int = 0;
    return Int32.tryParse(token, parsed);
  }

  static resolvePath(value: TemplateValue, segments: string[], scope: RenderScope): TemplateValue {
    let cur: TemplateValue = value;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (cur instanceof NilValue) return TemplateRuntime.nil;

      if (cur instanceof PageValue) {
        const page = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "title") cur = new StringValue(page.title);
        else if (k === "content") cur = new HtmlValue(page.content);
        else if (k === "summary") cur = new HtmlValue(page.summary);
        else if (k === "date") cur = new StringValue(page.date);
        else if (k === "lastmod") cur = new StringValue(page.lastmod);
        else if (k === "plain") cur = new StringValue(page.plain);
        else if (k === "tableofcontents") cur = new HtmlValue(page.tableOfContents);
        else if (k === "draft") cur = new BoolValue(page.draft);
        else if (k === "kind") cur = new StringValue(page.kind);
        else if (k === "section") cur = new StringValue(page.section);
        else if (k === "type") cur = new StringValue(page.type);
        else if (k === "slug") cur = new StringValue(page.slug);
        else if (k === "relpermalink") cur = new StringValue(page.relPermalink);
        else if (k === "layout") cur = page.layout !== undefined && page.layout.trim() !== "" ? new StringValue(page.layout) : TemplateRuntime.nil;
        else if (k === "file") cur = page.File !== undefined ? new FileValue(page.File) : TemplateRuntime.nil;
        else if (k === "language") cur = new LanguageValue(page.Language);
        else if (k === "translations") cur = new PageArrayValue(page.Translations);
        else if (k === "store") cur = new ScratchValue(TemplateRuntime.getPageStore(page));
        else if (k === "sites") cur = new SitesValue(scope.site);
        else if (k === "page") cur = cur;
        else if (k === "parent") cur = page.parent !== undefined ? new PageValue(page.parent) : TemplateRuntime.nil;
        else if (k === "ancestors") cur = new PageArrayValue(page.ancestors);
        else if (k === "permalink") {
          const rel = page.relPermalink.startsWith("/") ? page.relPermalink.substring(1) : page.relPermalink;
          cur = new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
        } else if (k === "site") cur = new SiteValue(page.site);
        else if (k === "resources") {
          const mgr = TemplateRuntime.getResourceManager(scope.env);
          cur = mgr !== undefined ? new PageResourcesValue(page, mgr) : TemplateRuntime.nil;
        }
        else if (k === "pages") cur = new PageArrayValue(page.pages);
        else if (k === "description") cur = new StringValue(page.description);
        else if (k === "tags") cur = new StringArrayValue(page.tags);
        else if (k === "categories") cur = new StringArrayValue(page.categories);
        else if (k === "params") cur = TemplateRuntime.wrapParamDict(page.Params);
        else if (k === "ishome") cur = new BoolValue(page.kind === "home");
        else if (k === "ispage") cur = new BoolValue(page.kind === "page");
        else if (k === "issection") cur = new BoolValue(page.kind === "section");
        else if (k === "istaxonomy") cur = new BoolValue(page.kind === "taxonomy");
        else if (k === "isterm") cur = new BoolValue(page.kind === "term");
        else if (k === "isnode") cur = new BoolValue(page.kind !== "page");
        else if (k === "outputformats") cur = new OutputFormatsValue(page.site);
        else if (k === "previnsection") {
          const parentPage = page.parent;
          if (parentPage !== undefined) {
            const siblings = TemplateRuntime.copyPageArray(parentPage.pages);
            let foundIdx: int = -1;
            for (let pi = 0; pi < siblings.length; pi++) {
              const sibling = siblings[pi]!;
              if (sibling.relPermalink === page.relPermalink) {
                foundIdx = pi;
                break;
              }
            }
            if (foundIdx > 0) {
              const prevIdx: int = foundIdx - 1;
              cur = new PageValue(siblings[prevIdx]!);
            } else {
              cur = TemplateRuntime.nil;
            }
          } else {
            cur = TemplateRuntime.nil;
          }
        }
        else if (k === "nextinsection") {
          const parentPage = page.parent;
          if (parentPage !== undefined) {
            const siblings = TemplateRuntime.copyPageArray(parentPage.pages);
            let foundIdx: int = -1;
            for (let ni = 0; ni < siblings.length; ni++) {
              const sibling = siblings[ni]!;
              if (sibling.relPermalink === page.relPermalink) {
                foundIdx = ni;
                break;
              }
            }
            if (foundIdx >= 0 && foundIdx < siblings.length - 1) {
              const nextIdx: int = foundIdx + 1;
              cur = new PageValue(siblings[nextIdx]!);
            } else {
              cur = TemplateRuntime.nil;
            }
          } else {
            cur = TemplateRuntime.nil;
          }
        }
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof SiteValue) {
        const site = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "title") cur = new StringValue(site.title);
        else if (k === "baseurl") cur = new StringValue(site.baseURL);
        else if (k === "languagecode") cur = new StringValue(site.languageCode);
        else if (k === "copyright") cur = new StringValue(site.copyright);
        else if (k === "language") cur = new LanguageValue(site.Language);
        else if (k === "languages") cur = TemplateRuntime.wrapLanguages(site.Languages);
        else if (k === "ismultilingual") cur = new BoolValue(site.IsMultiLingual);
        else if (k === "languageprefix") cur = new StringValue(site.LanguagePrefix);
        else if (k === "home") cur = site.home !== undefined ? new PageValue(site.home) : TemplateRuntime.nil;
        else if (k === "allpages") cur = new PageArrayValue(site.allPages);
        else if (k === "store") cur = new ScratchValue(TemplateRuntime.getSiteStore(site));
        else if (k === "params") cur = TemplateRuntime.wrapParamDict(site.Params);
        else if (k === "pages") cur = new PageArrayValue(site.pages);
        else if (k === "mounts" || k === "docsmounts") cur = new DocsMountArrayValue(site.docsMounts);
        else if (k === "menus") cur = new MenusValue(site);
        else if (k === "taxonomies") cur = new TaxonomiesValue(site);
        else if (k === "outputformats") cur = new OutputFormatsValue(site);
        else if (k === "sites") cur = new SitesArrayValue(site.Sites);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof LanguageValue) {
        const lang = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "lang") cur = new StringValue(lang.Lang);
        else if (k === "languagename") cur = new StringValue(lang.LanguageName);
        else if (k === "languagedirection") cur = new StringValue(lang.LanguageDirection);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof FileValue) {
        const f = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "filename") cur = new StringValue(f.Filename);
        else if (k === "dir") cur = new StringValue(f.Dir);
        else if (k === "basefilename") cur = new StringValue(f.BaseFileName);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof SitesValue) {
        const k = seg.toLowerInvariant();
        if (k === "default") cur = new SiteValue(cur.value);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof MenusValue) {
        const site = cur.site;
        let entries: MenuEntry[] = [];
        const hasMenu = site.Menus.tryGetValue(seg, entries);
        if (hasMenu) {
          cur = new MenuArrayValue(entries, site);
        } else {
          const lowerSeg = seg.toLowerInvariant();
          const hasMenuLower = site.Menus.tryGetValue(lowerSeg, entries);
          cur = hasMenuLower ? new MenuArrayValue(entries, site) : TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof MenuEntryValue) {
        const entry = cur.value;
        const site = cur.site;
        const k = seg.toLowerInvariant();
        if (k === "name") cur = new StringValue(entry.name);
        else if (k === "url") cur = new StringValue(entry.url !== "" ? entry.url : entry.page?.relPermalink ?? "");
        else if (k === "title") cur = new StringValue(entry.title);
        else if (k === "weight") cur = new NumberValue(entry.weight);
        else if (k === "parent") cur = new StringValue(entry.parent);
        else if (k === "identifier") cur = new StringValue(entry.identifier);
        else if (k === "pre") cur = new StringValue(entry.pre);
        else if (k === "post") cur = new StringValue(entry.post);
        else if (k === "menu") cur = new StringValue(entry.menu);
        else if (k === "page") cur = entry.page !== undefined ? new PageValue(entry.page) : TemplateRuntime.nil;
        else if (k === "children") cur = new MenuArrayValue(entry.children, site);
        else if (k === "params") cur = TemplateRuntime.wrapParamDict(entry.Params);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof OutputFormatsValue) {
        const site = cur.site;
        const k = seg.toLowerInvariant();
        if (k === "get") {
          cur = new OutputFormatsGetValue(site);
        } else {
          cur = TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof OutputFormatValue) {
        const fmt = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "rel") cur = new StringValue(fmt.Rel);
        else if (k === "mediatype") cur = TemplateRuntime.wrapMediaType(fmt.MediaType);
        else if (k === "permalink") cur = new StringValue(fmt.Permalink);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof MediaTypeValue) {
        const mt = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "type") cur = new StringValue(mt.Type);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof ShortcodeValue) {
        const sc = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "name") cur = new StringValue(sc.name);
        else if (k === "page") cur = new PageValue(sc.Page);
        else if (k === "site") cur = new SiteValue(sc.Site);
        else if (k === "params") cur = TemplateRuntime.wrapParamDict(sc.Params);
        else if (k === "isnamedparams") cur = new BoolValue(sc.IsNamedParams);
        else if (k === "inner") cur = new HtmlValue(new HtmlString(sc.Inner));
        else if (k === "innerdeindent") cur = new HtmlValue(new HtmlString(sc.InnerDeindent));
        else if (k === "ordinal") cur = new NumberValue(sc.Ordinal);
        else if (k === "parent") cur = sc.Parent !== undefined ? new ShortcodeValue(sc.Parent) : TemplateRuntime.nil;
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof LinkHookValue) {
        const hook = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "destination") cur = new StringValue(hook.Destination);
        else if (k === "text") cur = new HtmlValue(new HtmlString(hook.Text));
        else if (k === "title") cur = new StringValue(hook.Title);
        else if (k === "plaintext") cur = new StringValue(hook.PlainText);
        else if (k === "page") cur = new PageValue(hook.Page);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof ImageHookValue) {
        const hook = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "destination") cur = new StringValue(hook.Destination);
        else if (k === "text") cur = new StringValue(hook.Text);
        else if (k === "title") cur = new StringValue(hook.Title);
        else if (k === "plaintext") cur = new StringValue(hook.PlainText);
        else if (k === "page") cur = new PageValue(hook.Page);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof HeadingHookValue) {
        const hook = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "level") cur = new NumberValue(hook.Level);
        else if (k === "text") cur = new HtmlValue(new HtmlString(hook.Text));
        else if (k === "plaintext") cur = new StringValue(hook.PlainText);
        else if (k === "anchor") cur = new StringValue(hook.Anchor);
        else if (k === "page") cur = new PageValue(hook.Page);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof TaxonomiesValue) {
        const site = cur.site;
        let terms: Dictionary<string, PageContext[]> = new Dictionary<string, PageContext[]>();
        const found = site.Taxonomies.tryGetValue(seg, terms);
        if (found) {
          cur = new TaxonomyTermsValue(terms, site);
        } else {
          const lowerSeg = seg.toLowerInvariant();
          const foundLower = site.Taxonomies.tryGetValue(lowerSeg, terms);
          cur = foundLower ? new TaxonomyTermsValue(terms, site) : TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof TaxonomyTermsValue) {
        const termsDict = cur.terms;
        const site = cur.site;
        let pages: PageContext[] = [];
        const found = termsDict.tryGetValue(seg, pages);
        if (found) {
          cur = new PageArrayValue(pages);
        } else {
          cur = TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof UrlValue) {
        const uri = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "isabs") {
          cur = new BoolValue(uri.isAbsoluteUri);
          continue;
        }
        if (k === "host") {
          // Hugo returns empty string for relative URIs, not an exception
          cur = new StringValue(uri.isAbsoluteUri ? uri.host : "");
          continue;
        }
        if (k === "scheme") {
          // Hugo returns empty string for relative URIs
          cur = new StringValue(uri.isAbsoluteUri ? uri.scheme : "");
          continue;
        }
        if (k === "string") {
          // Return the original string representation
          cur = new StringValue(uri.originalString);
          continue;
        }
        if (k === "path" || k === "rawquery" || k === "fragment") {
          const parts = TemplateRuntime.splitUrlParts(uri);
          if (k === "path") cur = new StringValue(parts.path);
          else if (k === "rawquery") cur = new StringValue(parts.rawQuery);
          else cur = new StringValue(parts.fragment);
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof ResourceValue) {
        const rv = cur as ResourceValue;
        const res = rv.value;
        const k = seg.toLowerInvariant();
        if (k === "content") {
          cur = new StringValue(res.text ?? "");
          continue;
        }
        if (k === "data") {
          cur = new ResourceDataValue(res.Data);
          continue;
        }
        if (k === "relpermalink") {
          if (res.outputRelPath === undefined || res.outputRelPath.trim() === "") {
            cur = TemplateRuntime.nil;
            continue;
          }
          rv.manager.ensurePublished(res);
          const slash: char = "/";
          const rel = res.outputRelPath.trimStart(slash);
          cur = new StringValue("/" + rel);
          continue;
        }
        if (k === "permalink") {
          if (res.outputRelPath === undefined || res.outputRelPath.trim() === "") {
            cur = TemplateRuntime.nil;
            continue;
          }
          rv.manager.ensurePublished(res);
          const slash: char = "/";
          const rel = res.outputRelPath.trimStart(slash);
          cur = new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
          continue;
        }
        if (k === "width") {
          cur = new NumberValue(res.width);
          continue;
        }
        if (k === "height") {
          cur = new NumberValue(res.height);
          continue;
        }
        if (k === "mediatype") {
          cur = new StringValue(res.mediaType);
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof ResourceDataValue) {
        const data = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "integrity") {
          cur = new StringValue(data.Integrity);
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof DocsMountValue) {
        const mount = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "name") cur = new StringValue(mount.name);
        else if (k === "urlprefix") cur = new StringValue(mount.urlPrefix);
        else if (k === "nav") cur = new NavArrayValue(mount.nav);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof NavItemValue) {
        const item = cur.value;
        const k = seg.toLowerInvariant();
        if (k === "title") cur = new StringValue(item.title);
        else if (k === "url") cur = new StringValue(item.url);
        else if (k === "children") cur = new NavArrayValue(item.children);
        else if (k === "issection") cur = new BoolValue(item.isSection);
        else if (k === "iscurrent") cur = new BoolValue(item.isCurrent);
        else if (k === "order") cur = new NumberValue(item.order);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof DictValue) {
        const dict = cur.value;
        let direct: TemplateValue = TemplateRuntime.nil;
        const hasDirect = dict.tryGetValue(seg, direct);
        if (hasDirect) {
          cur = direct;
          continue;
        }
        const lowerKey = seg.toLowerInvariant();
        let lower: TemplateValue = TemplateRuntime.nil;
        const hasLower = dict.tryGetValue(lowerKey, lower);
        if (hasLower) {
          cur = lower;
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      // Handle PageArrayValue zero-arg methods as properties
      if (cur instanceof PageArrayValue) {
        const pageArrVal = cur as PageArrayValue;
        const pages: PageContext[] = pageArrVal.value;
        const k = seg.toLowerInvariant();

        // Sorting methods (return sorted copy)
        if (k === "bylastmod") {
          const sorted = TemplateRuntime.sortPagesByDate(pages, "lastmod");
          cur = new PageArrayValue(sorted);
          continue;
        }
        if (k === "bydate") {
          const sorted = TemplateRuntime.sortPagesByDate(pages, "date");
          cur = new PageArrayValue(sorted);
          continue;
        }
        if (k === "bypublishdate") {
          const sorted = TemplateRuntime.sortPagesByDate(pages, "publishdate");
          cur = new PageArrayValue(sorted);
          continue;
        }
        if (k === "bytitle") {
          const sorted = TemplateRuntime.sortPagesByTitle(pages);
          cur = new PageArrayValue(sorted);
          continue;
        }
        if (k === "byweight") {
          const sorted = TemplateRuntime.sortPagesByWeight(pages);
          cur = new PageArrayValue(sorted);
          continue;
        }

        // Reverse (return reversed copy)
        if (k === "reverse") {
          const reversed = TemplateRuntime.reversePages(pages);
          cur = new PageArrayValue(reversed);
          continue;
        }

        // Length property
        if (k === "len") {
          cur = new NumberValue(pages.length);
          continue;
        }

        cur = TemplateRuntime.nil;
        continue;
      }

      return TemplateRuntime.nil;
    }
    return cur;
  }

  static wrapStringDict(dict: Dictionary<string, string>): DictValue {
    const mapped = new Dictionary<string, TemplateValue>();
    const it = dict.getEnumerator();
    while (it.moveNext()) {
      const kv = it.current;
      mapped.remove(kv.key);
      mapped.add(kv.key, new StringValue(kv.value));
    }
    return new DictValue(mapped);
  }

  static wrapParamDict(dict: Dictionary<string, ParamValue>): DictValue {
    const mapped = new Dictionary<string, TemplateValue>();
    const it = dict.getEnumerator();
    while (it.moveNext()) {
      const kv = it.current;
      const pv = kv.value;
      const kind = pv.kind;
      let tv: TemplateValue = new StringValue(pv.stringValue);
      if (kind === ParamKind.Bool) tv = new BoolValue(pv.boolValue);
      if (kind === ParamKind.Number) tv = new NumberValue(pv.numberValue);
      mapped.remove(kv.key);
      mapped.add(kv.key, tv);
    }
    return new DictValue(mapped);
  }

  static wrapLanguages(languages: LanguageContext[]): AnyArrayValue {
    const items = new List<TemplateValue>();
    for (let i = 0; i < languages.length; i++) items.add(new LanguageValue(languages[i]!));
    return new AnyArrayValue(items);
  }

  static wrapMediaType(mt: MediaType): MediaTypeValue {
    return new MediaTypeValue(mt);
  }

  static getPageStore(page: PageContext): ScratchStore {
    let existing = new ScratchStore();
    const has = TemplateRuntime.pageStores.tryGetValue(page, existing);
    if (has) return existing;
    const store = new ScratchStore();
    TemplateRuntime.pageStores.remove(page);
    TemplateRuntime.pageStores.add(page, store);
    return store;
  }

  static getSiteStore(site: SiteContext): ScratchStore {
    let existing = new ScratchStore();
    const has = TemplateRuntime.siteStores.tryGetValue(site, existing);
    if (has) return existing;
    const store = new ScratchStore();
    TemplateRuntime.siteStores.remove(site);
    TemplateRuntime.siteStores.add(site, store);
    return store;
  }

  static splitUrlParts(uri: Uri): UrlParts {
    let rawQuery = "";
    let fragment = "";
    if (uri.isAbsoluteUri) {
      rawQuery = uri.query.startsWith("?") ? uri.query.substring(1) : uri.query;
      fragment = uri.fragment.startsWith("#") ? uri.fragment.substring(1) : uri.fragment;
      return new UrlParts(uri.absolutePath, rawQuery, fragment);
    }

    const raw = uri.originalString;
    const hashIndex = raw.indexOf("#");
    const beforeHash = hashIndex >= 0 ? raw.substring(0, hashIndex) : raw;
    fragment = hashIndex >= 0 ? raw.substring(hashIndex + 1) : "";

    const queryIndex = beforeHash.indexOf("?");
    const path = queryIndex >= 0 ? beforeHash.substring(0, queryIndex) : beforeHash;
    rawQuery = queryIndex >= 0 ? beforeHash.substring(queryIndex + 1) : "";

    return new UrlParts(path, rawQuery, fragment);
  }

  static normalizeRelPath(raw: string): string {
    const normalized = replaceText(raw, "\\", "/");
    const parts = normalized.split("/");
    const outParts = new List<string>();
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!.trim();
      if (p === "" || p === ".") continue;
      if (p === "..") {
        if (outParts.count > 0) outParts.removeAt(outParts.count - 1);
        continue;
      }
      outParts.add(p);
    }
    const arr = outParts.toArray();
    let out = "";
    for (let i = 0; i < arr.length; i++) out = out === "" ? arr[i]! : out + "/" + arr[i]!;
    return out;
  }

  private static segmentMatch(pattern: string, segment: string): boolean {
    if (pattern === "*") return true;
    const star = pattern.indexOf("*");
    if (star < 0) return pattern === segment;

    const parts = pattern.split("*");
    let pos = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (p === "") continue;
      const idx = segment.indexOf(p, pos);
      if (idx < 0) return false;
      if (i === 0 && !pattern.startsWith("*") && idx !== 0) return false;
      pos = idx + p.length;
    }
    if (!pattern.endsWith("*") && pos !== segment.length) return false;
    return true;
  }

  private static splitGlobSegments(raw: string): string[] {
    const slash: char = "/";
    const normalized = replaceText(raw.trim(), "\\", "/").trimStart(slash);
    if (normalized === "") {
      const empty: string[] = [];
      return empty;
    }
    return normalized.split("/");
  }

  private static globMatchAt(patSegs: string[], pathSegs: string[], pi: int, si: int): boolean {
    if (pi >= patSegs.length) return si >= pathSegs.length;
    const p = patSegs[pi]!;
    if (p === "**") {
      for (let i = si; i <= pathSegs.length; i++) {
        if (TemplateRuntime.globMatchAt(patSegs, pathSegs, pi + 1, i)) return true;
      }
      return false;
    }
    if (si >= pathSegs.length) return false;
    if (!TemplateRuntime.segmentMatch(p, pathSegs[si]!)) return false;
    return TemplateRuntime.globMatchAt(patSegs, pathSegs, pi + 1, si + 1);
  }

  static globMatch(patternRaw: string, pathRaw: string): boolean {
    const patSegs = TemplateRuntime.splitGlobSegments(patternRaw);
    const pathSegs = TemplateRuntime.splitGlobSegments(pathRaw);
    return TemplateRuntime.globMatchAt(patSegs, pathSegs, 0, 0);
  }

  static resolvePageRef(page: PageContext, ref: string): string {
    const raw = ref.trim();
    if (raw === "" || raw === "/") return "";
    if (raw.startsWith("/")) return TemplateRuntime.trimSlashes(raw);
    const base = page.File !== undefined ? page.File.Dir : TemplateRuntime.trimSlashes(page.relPermalink);
    const combined =
      base === "" ? raw : TemplateRuntime.trimEndChar(base, "/") + "/" + TemplateRuntime.trimStartChar(raw, "/");
    return TemplateRuntime.normalizeRelPath(combined);
  }

  static tryGetPage(site: SiteContext, pathRaw: string): PageContext | undefined {
    const trimmed = pathRaw.trim();
    if (trimmed === "" || trimmed === "/") return site.home;
    const needle = TemplateRuntime.trimSlashes(trimmed);
    if (needle === "") return site.home;
    let candidates: PageContext[] = site.pages;
    if (site.allPages.length > 0) candidates = site.allPages;
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i]!;
      if (TemplateRuntime.trimSlashes(p.relPermalink) === needle) return p;
      if (p.slug === needle) return p;
    }
    return undefined;
  }

  static toTitleCase(text: string): string {
    const trimmed = text.trim();
    if (trimmed === "") return "";
    const parts = trimmed.split(" ");
    const sb = new StringBuilder();
    for (let i = 0; i < parts.length; i++) {
      const word = parts[i]!;
      if (word.trim() === "") continue;
      if (sb.length > 0) sb.append(" ");
      const first = word.substring(0, 1).toUpperInvariant();
      const rest = word.length > 1 ? word.substring(1).toLowerInvariant() : "";
      sb.append(first);
      sb.append(rest);
    }
    return sb.toString();
  }

  static toPages(value: TemplateValue): PageContext[] {
    if (value instanceof PageArrayValue) return value.value;
    if (value instanceof AnyArrayValue) {
      const out = new List<PageContext>();
      const it = value.value.getEnumerator();
      while (it.moveNext()) {
        const cur = it.current;
        if (cur instanceof PageValue) out.add((cur as PageValue).value);
      }
      return out.toArray();
    }
    const empty: PageContext[] = [];
    return empty;
  }

  /**
   * Sort pages by date field. Returns a new sorted array (ascending by default).
   * @param pages - The pages to sort
   * @param field - "date", "lastmod", or "publishdate"
   */
  static sortPagesByDate(pages: PageContext[], field: string): PageContext[] {
    const copy = new List<PageContext>();
    for (let i = 0; i < pages.length; i++) copy.add(pages[i]!);

    // Simple bubble sort for stability and tsonic compatibility
    const arr = copy.toArray();
    const len = arr.length;
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i - 1; j++) {
        const a = arr[j]!;
        const b = arr[j + 1]!;
        // Use date for all fields (publishdate falls back to date)
        const dateA = field === "lastmod" ? a.lastmod : a.date;
        const dateB = field === "lastmod" ? b.lastmod : b.date;
        // Compare dates (ascending order)
        if (dateA.compareTo(dateB) > 0) {
          arr[j] = b;
          arr[j + 1] = a;
        }
      }
    }
    return arr;
  }

  /**
   * Sort pages by title. Returns a new sorted array (ascending).
   */
  static sortPagesByTitle(pages: PageContext[]): PageContext[] {
    const copy = new List<PageContext>();
    for (let i = 0; i < pages.length; i++) copy.add(pages[i]!);

    // Simple bubble sort
    const arr = copy.toArray();
    const len = arr.length;
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i - 1; j++) {
        const a = arr[j]!;
        const b = arr[j + 1]!;
        if (a.title.compareTo(b.title) > 0) {
          arr[j] = b;
          arr[j + 1] = a;
        }
      }
    }
    return arr;
  }

  /**
   * Sort pages by weight. Returns a new sorted array (ascending).
   * Note: PageContext currently doesn't have a weight field, so this returns original order.
   */
  static sortPagesByWeight(pages: PageContext[]): PageContext[] {
    // TODO: Add weight field to PageContext when needed
    // For now, return a copy in original order
    const copy = new List<PageContext>();
    for (let i = 0; i < pages.length; i++) copy.add(pages[i]!);
    return copy.toArray();
  }

  /**
   * Reverse the order of pages. Returns a new reversed array.
   */
  static reversePages(pages: PageContext[]): PageContext[] {
    const len = pages.length;
    const reversed = new List<PageContext>();
    for (let i = len - 1; i >= 0; i--) reversed.add(pages[i]!);
    return reversed.toArray();
  }

  /**
   * Copy a page array to a new array.
   */
  static copyPageArray(pages: PageContext[]): PageContext[] {
    const copy = new List<PageContext>();
    for (let i = 0; i < pages.length; i++) copy.add(pages[i]!);
    return copy.toArray();
  }

  /**
   * Copy a string array to a new array.
   */
  static copyStringArray(strings: string[]): string[] {
    const copy = new List<string>();
    for (let i = 0; i < strings.length; i++) copy.add(strings[i]!);
    return copy.toArray();
  }

  /**
   * Compare two template values for sorting.
   * Returns negative if a < b, positive if a > b, 0 if equal.
   */
  static compareValues(a: TemplateValue, b: TemplateValue): int {
    // Compare strings
    if (a instanceof StringValue && b instanceof StringValue) {
      const aStr = (a as StringValue).value;
      const bStr = (b as StringValue).value;
      return aStr.compareTo(bStr);
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
    const aPlain = TemplateRuntime.toPlainString(a);
    const bPlain = TemplateRuntime.toPlainString(b);
    return aPlain.compareTo(bPlain);
  }

  static matchWhere(actual: TemplateValue, op: string, expected: TemplateValue): boolean {
    const opLower = op.trim().toLowerInvariant();
    const actualText = TemplateRuntime.toPlainString(actual);

    if (opLower === "eq" || opLower === "==") {
      return actualText === TemplateRuntime.toPlainString(expected);
    }
    if (opLower === "ne" || opLower === "!=") {
      return actualText !== TemplateRuntime.toPlainString(expected);
    }
    if (opLower === "in") {
      if (expected instanceof AnyArrayValue) {
        const it = expected.value.getEnumerator();
        while (it.moveNext()) {
          if (TemplateRuntime.toPlainString(it.current) === actualText) return true;
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
        let v: TemplateValue = TemplateRuntime.nil;
        return expected.value.tryGetValue(actualText, v);
      }
      return false;
    }
    if (opLower === "not in") {
      return !TemplateRuntime.matchWhere(actual, "in", expected);
    }

    return false;
  }

  static evalToken(token: string, scope: RenderScope): TemplateValue {
    const t = token.trim();
    if (t === ".") return scope.dot;
    if (t === "$") return scope.root;
    if (t.startsWith("$.")) {
      const segs = t.substring(2).split(".");
      return TemplateRuntime.resolvePath(scope.root, segs, scope);
    }
    if (t.startsWith(".")) {
      const segs = t.substring(1).split(".");
      return TemplateRuntime.resolvePath(scope.dot, segs, scope);
    }
    if (t.startsWith("$") && t.length > 1) {
      const inner = t.substring(1);
      const segs = inner.split(".");
      const name = segs.length > 0 ? segs[0]! : inner;
      const value = scope.getVar(name) ?? TemplateRuntime.nil;
      if (segs.length > 1) {
        const rem = new List<string>();
        for (let i = 1; i < segs.length; i++) rem.add(segs[i]!);
        return TemplateRuntime.resolvePath(value, rem.toArray(), scope);
      }
      return value;
    }
    if (t === "site") return new SiteValue(scope.site);
    if (t.startsWith("site.")) {
      const segs = t.substring(5).split(".");
      return TemplateRuntime.resolvePath(new SiteValue(scope.site), segs, scope);
    }
    const lit = TemplateRuntime.parseStringLiteral(t);
    if (lit !== undefined) return new StringValue(lit);
    if (t === "true") return new BoolValue(true);
    if (t === "false") return new BoolValue(false);
    if (TemplateRuntime.isNumberLiteral(t)) return new NumberValue(Int32.parse(t));
    return new StringValue(t);
  }

  static convertGoDateLayoutToDotNet(layout: string): string {
    // Best-effort mapping for common Hugo layouts.
    let f = layout;
    f = replaceText(f, "Monday", "dddd");
    f = replaceText(f, "Mon", "ddd");
    f = replaceText(f, "January", "MMMM");
    f = replaceText(f, "Jan", "MMM");
    f = replaceText(f, "2006", "yyyy");
    f = replaceText(f, "06", "yy");
    f = replaceText(f, "02", "dd");
    f = replaceText(f, "2", "d");
    f = replaceText(f, "01", "MM");
    f = replaceText(f, "1", "M");
    f = replaceText(f, "15", "HH");
    f = replaceText(f, "03", "hh");
    f = replaceText(f, "3", "h");
    f = replaceText(f, "04", "mm");
    f = replaceText(f, "05", "ss");
    f = replaceText(f, "PM", "tt");
    return f;
  }

  static callFunction(
    nameRaw: string,
    args: TemplateValue[],
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    _defines: Dictionary<string, TemplateNode[]>,
  ): TemplateValue {
    const name = nameRaw.trim().toLowerInvariant();
    try {

    if (name === "site.store.get" && args.length >= 1) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      return store.get(TemplateRuntime.toPlainString(args[0]!));
    }
    if (name === "site.store.set" && args.length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.set(TemplateRuntime.toPlainString(args[0]!), args[1]!);
      return TemplateRuntime.nil;
    }
    if (name === "site.store.add" && args.length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.add(TemplateRuntime.toPlainString(args[0]!), args[1]!);
      return TemplateRuntime.nil;
    }
    if (name === "site.store.delete" && args.length >= 1) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.delete(TemplateRuntime.toPlainString(args[0]!));
      return TemplateRuntime.nil;
    }
    if (name === "site.store.setinmap" && args.length >= 3) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      const mapName = TemplateRuntime.toPlainString(args[0]!);
      const key = TemplateRuntime.toPlainString(args[1]!);
      const value = args[2]!;
      try {
        store.setInMap(mapName, key, value);
      } catch (e) {
        throw new Exception(`site.Store.SetInMap failed (map=${mapName}, key=${key}): ${e}`);
      }
      return TemplateRuntime.nil;
    }
    if (name === "site.store.deleteinmap" && args.length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.deleteInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!));
      return TemplateRuntime.nil;
    }

    const trimmedName = nameRaw.trim();
    const lastDot = trimmedName.lastIndexOf(".");
    const lowerName = trimmedName.toLowerInvariant();
    const startsWithDot = trimmedName.startsWith(".");
    const startsWithDollar = trimmedName.startsWith("$");
    const startsWithSite = lowerName.startsWith("site.");

    let receiverToken: string | undefined = undefined;
    let methodName: string | undefined = undefined;
    if (lastDot > 0) {
      if (startsWithDot || startsWithDollar || startsWithSite) {
        receiverToken = trimmedName.substring(0, lastDot);
        methodName = trimmedName.substring(lastDot + 1).trim();
      }
    } else if (startsWithDot && lastDot === 0) {
      receiverToken = ".";
      methodName = trimmedName.substring(1).trim();
    }

    if (receiverToken !== undefined && methodName !== undefined && methodName.trim() !== "") {
      const method = methodName.toLowerInvariant();
      const receiverValue = TemplateRuntime.evalToken(receiverToken, scope);

      if (receiverValue instanceof ScratchValue) {
        const scratch = receiverValue as ScratchValue;
        const store = scratch.value;
        if (method === "get" && args.length >= 1) return store.get(TemplateRuntime.toPlainString(args[0]!));
        if (method === "set" && args.length >= 2) {
          store.set(TemplateRuntime.toPlainString(args[0]!), args[1]!);
          return TemplateRuntime.nil;
        }
        if (method === "add" && args.length >= 2) {
          store.add(TemplateRuntime.toPlainString(args[0]!), args[1]!);
          return TemplateRuntime.nil;
        }
        if (method === "delete" && args.length >= 1) {
          store.delete(TemplateRuntime.toPlainString(args[0]!));
          return TemplateRuntime.nil;
        }
        if (method === "setinmap" && args.length >= 3) {
          store.setInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!), args[2]!);
          return TemplateRuntime.nil;
        }
        if (method === "deleteinmap" && args.length >= 2) {
          store.deleteInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!));
          return TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof PageResourcesValue) {
        const resources = receiverValue as PageResourcesValue;
        const mgr = resources.manager;
        const page = resources.page;

        if (method === "get" && args.length >= 1) {
          if (page.File === undefined) return TemplateRuntime.nil;
          const raw = TemplateRuntime.toPlainString(args[0]!);
          const normalized = TemplateRuntime.normalizeRelPath(raw);
          if (normalized === "") return TemplateRuntime.nil;

          const pageDir = Path.getDirectoryName(page.File.Filename);
          if (pageDir === undefined || pageDir.trim() === "") return TemplateRuntime.nil;

          const pageDirFull = Path.getFullPath(pageDir);
          const pagePrefix = pageDirFull.endsWith(Path.directorySeparatorChar) ? pageDirFull : pageDirFull + Path.directorySeparatorChar;
          const slash: char = "/";
          const osRel = normalized.replace(slash, Path.directorySeparatorChar);
          const candidate = Path.getFullPath(Path.combine(pageDirFull, osRel));
          if (!candidate.startsWith(pagePrefix) || !File.exists(candidate)) return TemplateRuntime.nil;

          const bytes = File.readAllBytes(candidate);
          const ext = (Path.getExtension(candidate) ?? "").toLowerInvariant();
          const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
          const text = isText ? Encoding.UTF8.getString(bytes) : undefined;

          const base = TemplateRuntime.trimSlashes(page.relPermalink);
          const outRel = base === "" ? normalized : TemplateRuntime.trimEndChar(base, "/") + "/" + normalized;
          const id = `pageRes:${page.relPermalink}:${normalized}`;
          const res = new Resource(id, candidate, true, outRel, bytes, text, new ResourceData(""));
          return new ResourceValue(mgr, res);
        }

        if (method === "getmatch" && args.length >= 1) {
          if (page.File === undefined) return TemplateRuntime.nil;
          const pattern = TemplateRuntime.toPlainString(args[0]!).trim();
          if (pattern === "") return TemplateRuntime.nil;

          const pageDir = Path.getDirectoryName(page.File.Filename);
          if (pageDir === undefined || pageDir.trim() === "") return TemplateRuntime.nil;

          const files = Directory.getFiles(pageDir, "*", SearchOption.allDirectories);
          for (let i = 0; i < files.length; i++) {
            const filePath = files[i]!;
            const rel = filePath.length > 0 ? replaceText(Path.getRelativePath(pageDir, filePath), "\\", "/") : "";
            if (rel === "" || !TemplateRuntime.globMatch(pattern, rel)) continue;

            const bytes = File.readAllBytes(filePath);
            const ext = (Path.getExtension(filePath) ?? "").toLowerInvariant();
            const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
            const text = isText ? Encoding.UTF8.getString(bytes) : undefined;

            const base = TemplateRuntime.trimSlashes(page.relPermalink);
            const outRel = base === "" ? rel : TemplateRuntime.trimEndChar(base, "/") + "/" + rel;
            const id = `pageRes:${page.relPermalink}:${rel}`;
            const res = new Resource(id, filePath, true, outRel, bytes, text, new ResourceData(""));
            return new ResourceValue(mgr, res);
          }

          return TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof SiteValue) {
        const site = (receiverValue as SiteValue).value;
        if (method === "getpage" && args.length >= 1) {
          const path = TemplateRuntime.toPlainString(args[0]!);
          const p = TemplateRuntime.tryGetPage(site, path);
          return p !== undefined ? new PageValue(p) : TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof PageValue) {
        const page = (receiverValue as PageValue).value;

        if (method === "renderstring" && args.length >= 1) {
          const markdown = TemplateRuntime.toPlainString(args[0]!);
          // Use full markdown rendering with shortcodes and render hooks
          const result = renderMarkdownWithShortcodes(markdown, page, scope.site, env);
          return new HtmlValue(new HtmlString(result.html));
        }

        if (method === "getpage" && args.length >= 1) {
          const raw = TemplateRuntime.toPlainString(args[0]!);
          const resolved = TemplateRuntime.resolvePageRef(page, raw);
          const found = TemplateRuntime.tryGetPage(page.site, resolved);
          return found !== undefined ? new PageValue(found) : TemplateRuntime.nil;
        }

        if (method === "isancestor" && args.length >= 1) {
          const otherValue = args[0]!;
          if (otherValue instanceof PageValue) {
            const other = (otherValue as PageValue).value;
            const ancestors = other.ancestors;
            for (let i = 0; i < ancestors.length; i++) {
              if (ancestors[i] === page) return new BoolValue(true);
            }
            const base = TemplateRuntime.trimEndChar(page.relPermalink, "/");
            const child = TemplateRuntime.trimEndChar(other.relPermalink, "/");
            return new BoolValue(child.startsWith(base) && child !== base);
          }
          return new BoolValue(false);
        }

        if (method === "ismenucurrent" && args.length >= 2) {
          const menuNameArg = args[0]!;
          const entryArg = args[1]!;
          if (entryArg instanceof MenuEntryValue) {
            const entry = (entryArg as MenuEntryValue).value;
            const entryUrl = entry.url !== "" ? entry.url : (entry.page?.relPermalink ?? "");
            const pagePermalink = TemplateRuntime.trimEndChar(page.relPermalink, "/");
            const entryUrlNormalized = TemplateRuntime.trimEndChar(entryUrl, "/");
            if (pagePermalink === entryUrlNormalized) return new BoolValue(true);
            if (entry.page !== undefined && entry.page === page) return new BoolValue(true);
          }
          return new BoolValue(false);
        }
      }

      if (receiverValue instanceof OutputFormatsValue) {
        const site = (receiverValue as OutputFormatsValue).site;
        if (method === "get" && args.length >= 1) {
          const formatName = TemplateRuntime.toPlainString(args[0]!).toLowerInvariant();
          const formats = site.getOutputFormats();
          for (let i = 0; i < formats.length; i++) {
            const fmt = formats[i]!;
            if (fmt.Rel.toLowerInvariant() === formatName || formatName === "rss") {
              return new OutputFormatValue(fmt);
            }
          }
          return TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof ShortcodeValue) {
        const sc = (receiverValue as ShortcodeValue).value;
        if (method === "get" && args.length >= 1) {
          const keyOrIndex = TemplateRuntime.toPlainString(args[0]!);
          const pv = sc.Get(keyOrIndex);
          if (pv === undefined) return TemplateRuntime.nil;
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
            const arr = new List<TemplateValue>();
            const it = items.getEnumerator();
            while (it.moveNext()) arr.add(it.current);
            const vals = arr.toArray();

            let idx: int = -1;
            for (let i = 0; i < vals.length; i++) {
              const cur = vals[i]!;
              if (cur instanceof PageValue && (cur as PageValue).value === targetPage) {
                idx = i;
                break;
              }
            }
            if (idx < 0) return TemplateRuntime.nil;
            const nextIndex = method === "next" ? idx + 1 : idx - 1;
            if (nextIndex < 0 || nextIndex >= vals.length) return TemplateRuntime.nil;
            return vals[nextIndex]!;
          }
        }
      }
    }

    if (name === "return") {
      const v = args.length >= 1 ? args[0]! : TemplateRuntime.nil;
      throw new ReturnException(v);
    }

    if (name === "hugo.ismultilingual") return new BoolValue(false);
    if (name === "hugo.ismultihost") return new BoolValue(false);
    if (name === "hugo.workingdir") return new StringValue(Environment.currentDirectory);
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
      const key = TemplateRuntime.toPlainString(args[0]!);
      const lang = scope.site.Language.Lang;
      const translated = env.getI18n(lang, key);
      return new StringValue(translated);
    }

    if (name === "resources.get" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const path = TemplateRuntime.toPlainString(args[0]!);
      const res = mgr.get(path);
      return res !== undefined ? new ResourceValue(mgr, res) : TemplateRuntime.nil;
    }

    if (name === "resources.getmatch" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const res = mgr.getMatch(pattern);
      return res !== undefined ? new ResourceValue(mgr, res) : TemplateRuntime.nil;
    }

    // resources.Match - get all matching resources (returns array)
    if (name === "resources.match" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return new AnyArrayValue(new List<TemplateValue>());
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const resources = mgr.match(pattern);
      const result = new List<TemplateValue>();
      for (let i = 0; i < resources.length; i++) {
        result.add(new ResourceValue(mgr, resources[i]!));
      }
      return new AnyArrayValue(result);
    }

    // resources.ByType - get all resources of a given media type
    if (name === "resources.bytype" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return new AnyArrayValue(new List<TemplateValue>());
      const mediaType = TemplateRuntime.toPlainString(args[0]!);
      const resources = mgr.byType(mediaType);
      const result = new List<TemplateValue>();
      for (let i = 0; i < resources.length; i++) {
        result.add(new ResourceValue(mgr, resources[i]!));
      }
      return new AnyArrayValue(result);
    }

    // resources.Concat - concatenate resources into one
    if (name === "resources.concat" && args.length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const targetPath = TemplateRuntime.toPlainString(args[0]!);
      const input = args[args.length - 1]!;
      // Input can be an array of resources (piped from slice or Match)
      const resources = new List<Resource>();
      if (input instanceof AnyArrayValue) {
        const arr = input.value.toArray();
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i]!;
          if (item instanceof ResourceValue) {
            resources.add((item as ResourceValue).value);
          }
        }
      } else if (input instanceof ResourceValue) {
        resources.add((input as ResourceValue).value);
      }
      if (resources.count === 0) return TemplateRuntime.nil;
      const res = mgr.concat(targetPath, resources.toArray());
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.fromstring" && args.length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const content = TemplateRuntime.toPlainString(args[1]!);
      const res = mgr.fromString(nameArg, content);
      return new ResourceValue(mgr, res);
    }

	    if (name === "resources.executeastemplate" && args.length >= 2) {
	      const mgr = TemplateRuntime.getResourceManager(env);
	      if (mgr === undefined) return TemplateRuntime.nil;
	      const piped = args.length >= 3 ? args[args.length - 1]! : TemplateRuntime.nil;
	      const isResource = piped instanceof ResourceValue;
	      if (isResource === false) return TemplateRuntime.nil;
	      const src = (piped as ResourceValue).value;
	      const targetName = TemplateRuntime.toPlainString(args[0]!);
	      const ctx = args[1]!;
	      const templateText = src.text ?? "";
	      const tpl = TemplateRuntime.parseTemplateText(templateText);
	      const sb = new StringBuilder();
	      const templateScope = new RenderScope(ctx, ctx, scope.site, scope.env, undefined);
	      tpl.renderInto(sb, templateScope, env, overrides);
	      const rendered = sb.toString();
      const bytes = Encoding.UTF8.getBytes(rendered);
      const lang = scope.site.Language.Lang;
      const id = `${src.id}|executeAsTemplate:${targetName}|lang:${lang}`;
      const out = new Resource(id, src.sourcePath, src.publishable, targetName, bytes, rendered, new ResourceData(""));
      return new ResourceValue(mgr, out);
    }

    if (name === "resources.minify" || name === "minify") {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args.length >= 1 ? args[args.length - 1]! : TemplateRuntime.nil;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.minify(src);
      return new ResourceValue(mgr, res);
    }

    if ((name === "resources.fingerprint" || name === "fingerprint") && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.fingerprint(src);
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.copy" && args.length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const targetPath = TemplateRuntime.toPlainString(args[0]!);
      const piped = args[args.length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.copy(targetPath, src);
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.postprocess" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.postProcess(src);
      return new ResourceValue(mgr, res);
    }

    if ((name === "images.resize" || name === "resize") && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;

      // First arg is resize spec, piped resource is last arg
      const spec = args.length >= 2 ? TemplateRuntime.toPlainString(args[0]!) : "";
      const piped = args[args.length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.resize(src, spec);
      return new ResourceValue(mgr, res);
    }

    if (name === "css.sass" && args.length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.sassCompile(src);
      return new ResourceValue(mgr, res);
    }

    if (name === "partial" && args.length >= 1) {
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const ctx = args.length >= 2 ? args[1]! : scope.dot;
      const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
      if (tpl === undefined) return TemplateRuntime.nil;

      const sb = new StringBuilder();
      const partialScope = new RenderScope(ctx, ctx, scope.site, scope.env, undefined);
      try {
        tpl.renderInto(sb, partialScope, env, overrides);
        return new HtmlValue(new HtmlString(sb.toString()));
      } catch (e) {
        if (e instanceof ReturnException) return e.value;
        throw e;
      }
    }

    if (name === "partialcached" && args.length >= 1) {
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const ctx = args.length >= 2 ? args[1]! : scope.dot;
      const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
      if (tpl === undefined) return TemplateRuntime.nil;

      const sb = new StringBuilder();
      const partialScope = new RenderScope(ctx, ctx, scope.site, scope.env, undefined);
      try {
        tpl.renderInto(sb, partialScope, env, overrides);
        return new HtmlValue(new HtmlString(sb.toString()));
      } catch (e) {
        if (e instanceof ReturnException) return e.value;
        throw e;
      }
    }

    // templates.Exists - check if a template exists
    if (name === "templates.exists" && args.length >= 1) {
      const templatePath = TemplateRuntime.toPlainString(args[0]!);
      const tpl = env.getTemplate(templatePath);
      return new BoolValue(tpl !== undefined);
    }

    // errorf - log error and continue (in Hugo this can halt, but we just warn)
    if (name === "errorf" && args.length >= 1) {
      const format = TemplateRuntime.toPlainString(args[0]!);
      let message = format;
      // Simple %s replacement for additional args
      for (let i = 1; i < args.length; i++) {
        message = message.replace("%s", TemplateRuntime.toPlainString(args[i]!));
        message = message.replace("%v", TemplateRuntime.toPlainString(args[i]!));
        message = message.replace("%d", TemplateRuntime.toPlainString(args[i]!));
      }
      Console.error.writeLine("ERROR: {0}", message);
      return TemplateRuntime.nil;
    }

    // warnf - log warning and continue
    if (name === "warnf" && args.length >= 1) {
      const format = TemplateRuntime.toPlainString(args[0]!);
      let message = format;
      for (let i = 1; i < args.length; i++) {
        message = message.replace("%s", TemplateRuntime.toPlainString(args[i]!));
        message = message.replace("%v", TemplateRuntime.toPlainString(args[i]!));
        message = message.replace("%d", TemplateRuntime.toPlainString(args[i]!));
      }
      Console.error.writeLine("WARN: {0}", message);
      return TemplateRuntime.nil;
    }

    if (name === "safehtml" && args.length >= 1) {
      const v = args[0]!;
      if (v instanceof HtmlValue) return v;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safehtmlattr" && args.length >= 1) {
      const v = args[0]!;
      if (v instanceof HtmlValue) return v;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safejs" && args.length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safeurl" && args.length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(escapeHtml(TemplateRuntime.toPlainString(v))));
    }

    if (name === "safecss" && args.length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "htmlescape" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(escapeHtml(TemplateRuntime.toPlainString(v)));
    }

    if (name === "htmlunescape" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(WebUtility.htmlDecode(TemplateRuntime.toPlainString(v)) ?? "");
    }

    if (name === "time.format" && args.length >= 2) {
      const layout = TemplateRuntime.toPlainString(args[0]!);
      const input = TemplateRuntime.toPlainString(args[1]!);
      let parsed: DateTime = DateTime.minValue;
      const ok = DateTime.tryParse(input, parsed);
      if (!ok) return new StringValue("");
      const fmt = TemplateRuntime.convertGoDateLayoutToDotNet(layout);
      return new StringValue(parsed.toString(fmt));
    }

	    if (name === "path.base" && args.length >= 1) {
	      const raw = TemplateRuntime.toPlainString(args[0]!);
	      const normalized = TemplateRuntime.trimEndChar(replaceText(raw, "\\", "/"), "/");
	      if (normalized === "") return new StringValue("");
	      const idx = normalized.lastIndexOf("/");
	      return idx >= 0 ? new StringValue(normalized.substring(idx + 1)) : new StringValue(normalized);
	    }

    if (name === "title" && args.length >= 1) {
      return new StringValue(TemplateRuntime.toTitleCase(TemplateRuntime.toPlainString(args[0]!)));
    }

    if (name === "where" && args.length >= 4) {
      const pages = TemplateRuntime.toPages(args[0]!);
      const path = TemplateRuntime.toPlainString(args[1]!);
      const opRaw = TemplateRuntime.toPlainString(args[2]!).toLowerInvariant();
      const expected = args[3]!;
      const empty: string[] = [];
      const segs = path.trim() === "" ? empty : path.split(".");
      const out = new List<PageContext>();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]!;
        const actual = segs.length === 0 ? new PageValue(page) : TemplateRuntime.resolvePath(new PageValue(page), segs, scope);
        const ok = TemplateRuntime.matchWhere(actual, opRaw, expected);
        if (ok) out.add(page);
      }
      return new PageArrayValue(out.toArray());
    }

    if (name === "sort" && args.length >= 1) {
      const collection = args[0]!;
      const sortKey = args.length >= 2 ? TemplateRuntime.toPlainString(args[1]!) : "";
      const sortOrder = args.length >= 3 ? TemplateRuntime.toPlainString(args[2]!).toLowerInvariant() : "asc";
      const isDesc = sortOrder === "desc";
      const empty: string[] = [];
      const keySegs = sortKey.trim() === "" ? empty : sortKey.split(".");

      if (collection instanceof PageArrayValue) {
        const arr = TemplateRuntime.copyPageArray(collection.value);
        // Simple bubble sort
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const aVal = keySegs.length === 0 ? new PageValue(arr[i]!) : TemplateRuntime.resolvePath(new PageValue(arr[i]!), keySegs, scope);
            const bVal = keySegs.length === 0 ? new PageValue(arr[j]!) : TemplateRuntime.resolvePath(new PageValue(arr[j]!), keySegs, scope);
            const cmp = TemplateRuntime.compareValues(aVal, bVal);
            const shouldSwap: boolean = isDesc ? cmp < 0 : cmp > 0;
            if (shouldSwap === true) {
              const tmp = arr[i]!;
              arr[i] = arr[j]!;
              arr[j] = tmp;
            }
          }
        }
        return new PageArrayValue(arr);
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.toArray();
        const sorted = new List<TemplateValue>();
        for (let i = 0; i < items.length; i++) sorted.add(items[i]!);
        const arr = sorted.toArray();
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const aVal = keySegs.length === 0 ? arr[i]! : TemplateRuntime.resolvePath(arr[i]!, keySegs, scope);
            const bVal = keySegs.length === 0 ? arr[j]! : TemplateRuntime.resolvePath(arr[j]!, keySegs, scope);
            const cmp = TemplateRuntime.compareValues(aVal, bVal);
            const shouldSwap: boolean = isDesc ? cmp < 0 : cmp > 0;
            if (shouldSwap === true) {
              const tmp = arr[i]!;
              arr[i] = arr[j]!;
              arr[j] = tmp;
            }
          }
        }
        const sortResult = new List<TemplateValue>();
        for (let i = 0; i < arr.length; i++) sortResult.add(arr[i]!);
        return new AnyArrayValue(sortResult);
      }

      return collection;
    }

    if (name === "after" && args.length >= 2) {
      const n = TemplateRuntime.toNumber(args[0]!);
      const collection = args[1]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const result = new List<PageContext>();
        for (let i = n; i < pages.length; i++) result.add(pages[i]!);
        return new PageArrayValue(result.toArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.toArray();
        const result = new List<TemplateValue>();
        for (let i = n; i < items.length; i++) result.add(items[i]!);
        return new AnyArrayValue(result);
      }

      return TemplateRuntime.nil;
    }

    if (name === "last" && args.length >= 2) {
      const n = TemplateRuntime.toNumber(args[0]!);
      const collection = args[1]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const start: int = pages.length > n ? pages.length - n : 0;
        const result = new List<PageContext>();
        for (let i = start; i < pages.length; i++) result.add(pages[i]!);
        return new PageArrayValue(result.toArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.toArray();
        const start: int = items.length > n ? items.length - n : 0;
        const result = new List<TemplateValue>();
        for (let i = start; i < items.length; i++) result.add(items[i]!);
        return new AnyArrayValue(result);
      }

      return TemplateRuntime.nil;
    }

    if (name === "uniq" && args.length >= 1) {
      const collection = args[0]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const seen = new Dictionary<string, boolean>();
        const uniqResult = new List<PageContext>();
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i]!;
          const key = p.relPermalink;
          let exists = false;
          const found = seen.tryGetValue(key, exists);
          if (found === false) {
            seen.add(key, true);
            uniqResult.add(p);
          }
        }
        return new PageArrayValue(uniqResult.toArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.toArray();
        const seen = new Dictionary<string, boolean>();
        const uniqResult = new List<TemplateValue>();
        for (let i = 0; i < items.length; i++) {
          const key = TemplateRuntime.toPlainString(items[i]!);
          let exists = false;
          const found = seen.tryGetValue(key, exists);
          if (found === false) {
            seen.add(key, true);
            uniqResult.add(items[i]!);
          }
        }
        return new AnyArrayValue(uniqResult);
      }

      return collection;
    }

    if (name === "group" && args.length >= 2) {
      const key = TemplateRuntime.toPlainString(args[0]!);
      const collection = args[1]!;
      const empty: string[] = [];
      const keySegs = key.trim() === "" ? empty : key.split(".");

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const groups = new Dictionary<string, List<PageContext>>();
        const groupOrder = new List<string>();

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]!;
          const val = TemplateRuntime.resolvePath(new PageValue(page), keySegs, scope);
          const groupKey = TemplateRuntime.toPlainString(val);

          let group: List<PageContext> = new List<PageContext>();
          const hasGroup = groups.tryGetValue(groupKey, group);
          if (hasGroup === false) {
            group = new List<PageContext>();
            groups.add(groupKey, group);
            groupOrder.add(groupKey);
          }
          group.add(page);
        }

        const groupResult = new List<TemplateValue>();
        const keys = groupOrder.toArray();
        for (let i = 0; i < keys.length; i++) {
          let group: List<PageContext> = new List<PageContext>();
          groups.tryGetValue(keys[i]!, group);
          const groupDict = new Dictionary<string, TemplateValue>();
          groupDict.add("Key", new StringValue(keys[i]!));
          groupDict.add("Pages", new PageArrayValue(group.toArray()));
          groupResult.add(new DictValue(groupDict));
        }
        return new AnyArrayValue(groupResult);
      }

      return TemplateRuntime.nil;
    }

    if (name === "plainify" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      // very small tag stripper (best-effort)
      const sb = new StringBuilder();
      let inTag = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s.substring(i, 1);
        if (ch === "<") {
          inTag = true;
          continue;
        }
        if (ch === ">") {
          inTag = false;
          continue;
        }
        if (!inTag) sb.append(ch);
      }
      return new StringValue(sb.toString());
    }

    if (name === "cond" && args.length >= 3) {
      return TemplateRuntime.isTruthy(args[0]!) ? args[1]! : args[2]!;
    }

    if (name === "dict") {
      const map = new Dictionary<string, TemplateValue>();
      for (let i = 0; i + 1 < args.length; i += 2) {
        const k = TemplateRuntime.toPlainString(args[i]!);
        map.remove(k);
        map.add(k, args[i + 1]!);
      }
      return new DictValue(map);
    }

    if (name === "slice") {
      const items = new List<TemplateValue>();
      for (let i = 0; i < args.length; i++) items.add(args[i]!);
      return new AnyArrayValue(items);
    }

    if (name === "append" && args.length >= 2) {
      const listValue = args[args.length - 1]!;
      const items = new List<TemplateValue>();
      if (listValue instanceof AnyArrayValue) {
        const it = listValue.value.getEnumerator();
        while (it.moveNext()) items.add(it.current);
      } else {
        items.add(listValue);
      }

      for (let i = 0; i < args.length - 1; i++) {
        const v = args[i]!;
        if (v instanceof AnyArrayValue) {
          const it = v.value.getEnumerator();
          while (it.moveNext()) items.add(it.current);
        } else {
          items.add(v);
        }
      }
      return new AnyArrayValue(items);
    }

    if (name === "merge" && args.length >= 2) {
      const a = args[0]!;
      const b = args[1]!;
      const merged = new Dictionary<string, TemplateValue>();
      if (a instanceof DictValue) {
        const it = a.value.getEnumerator();
        while (it.moveNext()) {
          const kv = it.current;
          merged.remove(kv.key);
          merged.add(kv.key, kv.value);
        }
      }
      if (b instanceof DictValue) {
        const it = b.value.getEnumerator();
        while (it.moveNext()) {
          const kv = it.current;
          merged.remove(kv.key);
          merged.add(kv.key, kv.value);
        }
      }
      return new DictValue(merged);
    }

    if (name === "isset" && args.length >= 2) {
      const container = args[0]!;
      const key = TemplateRuntime.toPlainString(args[1]!);
      if (container instanceof DictValue) {
        let v: TemplateValue = TemplateRuntime.nil;
        return new BoolValue(container.value.tryGetValue(key, v));
      }
      return new BoolValue(false);
    }

    if (name === "index" && args.length >= 2) {
      const container = args[0]!;
      const keyValue = args[1]!;
      if (container instanceof DictValue) {
        const key = TemplateRuntime.toPlainString(keyValue);
        let v: TemplateValue = TemplateRuntime.nil;
        return container.value.tryGetValue(key, v) ? v : TemplateRuntime.nil;
      }
      if (container instanceof AnyArrayValue) {
        if (keyValue instanceof NumberValue) {
          const idx = (keyValue as NumberValue).value;
          if (idx < 0 || idx >= container.value.count) return TemplateRuntime.nil;
          const it = container.value.getEnumerator();
          let pos: int = 0;
          while (it.moveNext()) {
            if (pos === idx) return it.current;
            pos++;
          }
          return TemplateRuntime.nil;
        }
      }
      if (container instanceof PageArrayValue) {
        if (keyValue instanceof NumberValue) {
          const idx = (keyValue as NumberValue).value;
          return idx >= 0 && idx < container.value.length ? new PageValue(container.value[idx]!) : TemplateRuntime.nil;
        }
      }
      return TemplateRuntime.nil;
    }

    if (name === "delimit" && args.length >= 2) {
      const listValue = args[0]!;
      const delim = TemplateRuntime.toPlainString(args[1]!);
      const parts = new List<string>();
      if (listValue instanceof AnyArrayValue) {
        const it = listValue.value.getEnumerator();
        while (it.moveNext()) parts.add(TemplateRuntime.toPlainString(it.current));
      } else if (listValue instanceof StringArrayValue) {
        for (let i = 0; i < listValue.value.length; i++) parts.add(listValue.value[i]!);
      }
      const arr = parts.toArray();
      let out = "";
      for (let i = 0; i < arr.length; i++) {
        if (i > 0) out += delim;
        out += arr[i]!;
      }
      return new StringValue(out);
    }

    if (name === "in" && args.length >= 2) {
      const container = args[0]!;
      const needle = TemplateRuntime.toPlainString(args[1]!);
      if (container instanceof AnyArrayValue) {
        const it = container.value.getEnumerator();
        while (it.moveNext()) {
          if (TemplateRuntime.toPlainString(it.current) === needle) return new BoolValue(true);
        }
        return new BoolValue(false);
      }
      if (container instanceof StringValue) {
        return new BoolValue(container.value.contains(needle));
      }
      return new BoolValue(false);
    }

	    if (name === "split" && args.length >= 2) {
	      const s = TemplateRuntime.toPlainString(args[0]!);
	      const delim = TemplateRuntime.toPlainString(args[1]!);
	      const items = new List<TemplateValue>();
	      if (delim === "") {
	        for (let i = 0; i < s.length; i++) items.add(new StringValue(s.substring(i, i + 1)));
	        return new AnyArrayValue(items);
	      }
	
	      let start = 0;
	      while (true) {
	        const idx = s.indexOf(delim, start);
	        if (idx < 0) break;
	        items.add(new StringValue(s.substring(start, idx)));
	        start = idx + delim.length;
	      }
	      items.add(new StringValue(s.substring(start)));
	      return new AnyArrayValue(items);
	    }

    if (name === "add" && args.length >= 2) {
      let sum: int = 0;
      for (let i = 0; i < args.length; i++) {
        const v = args[i]!;
        let parsed: int = 0;
        const s = TemplateRuntime.toPlainString(v);
        if (Int32.tryParse(s, parsed)) sum += parsed;
      }
      return new NumberValue(sum);
    }

    if (name === "sub" && args.length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      return new NumberValue(a - b);
    }

    if (name === "mul" && args.length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      return new NumberValue(a * b);
    }

    if (name === "div" && args.length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      if (b === 0) return new NumberValue(0);
      return new NumberValue(a / b);
    }

    if (name === "mod" && args.length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      if (b === 0) return new NumberValue(0);
      return new NumberValue(a % b);
    }

    if (name === "newscratch") {
      return new ScratchValue(new ScratchStore());
    }

    if (name === "encoding.jsonify" || name === "jsonify") {
      const v = args.length >= 1 ? args[0]! : TemplateRuntime.nil;
      return new StringValue(TemplateRuntime.toJson(v));
    }

    if (name === "crypto.sha1" && args.length >= 1) {
      const bytes = Encoding.UTF8.getBytes(TemplateRuntime.toPlainString(args[0]!));
      const hash = SHA1.hashData(bytes);
      return new StringValue(TemplateRuntime.bytesToHex(hash));
    }

    if (name === "md5" && args.length >= 1) {
      const bytes = Encoding.UTF8.getBytes(TemplateRuntime.toPlainString(args[0]!));
      const hash = MD5.hashData(bytes);
      return new StringValue(TemplateRuntime.bytesToHex(hash));
    }

    if (name === "urls.parse" && args.length >= 1) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      return new UrlValue(TemplateRuntime.parseUrl(s));
    }

    if (name === "urls.joinpath" && args.length >= 1) {
      const parts = new List<string>();
      for (let i = 0; i < args.length; i++) parts.add(TemplateRuntime.toPlainString(args[i]!));
      const arr = parts.toArray();
      let out = "";
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i]!;
        out = out === "" ? TemplateRuntime.trimSlashes(p) : TemplateRuntime.trimEndChar(out, "/") + "/" + TemplateRuntime.trimStartChar(p, "/");
      }
      return new StringValue(out);
    }

    if (name === "strings.contains" && args.length >= 2) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const sub = TemplateRuntime.toPlainString(args[1]!);
      return new BoolValue(s.contains(sub));
    }

    if (name === "strings.hasprefix" && args.length >= 2) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const prefix = TemplateRuntime.toPlainString(args[1]!);
      return new BoolValue(s.startsWith(prefix));
    }

    if (name === "strings.trimprefix" && args.length >= 2) {
      const prefix = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      return new StringValue(s.startsWith(prefix) ? s.substring(prefix.length) : s);
    }

    if (name === "strings.trimsuffix" && args.length >= 2) {
      const suffix = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      return new StringValue(s.endsWith(suffix) ? s.substring(0, s.length - suffix.length) : s);
    }

    if (name === "warnf") return TemplateRuntime.nil;
    if (name === "errorf") {
      const msg = TemplateRuntime.toPlainString(args.length >= 1 ? args[0]! : TemplateRuntime.nil);
      throw new Exception(msg);
    }

    if (name === "urlize" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(slugify(TemplateRuntime.toPlainString(v)));
    }

    if (name === "humanize" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(humanizeSlug(TemplateRuntime.toPlainString(v)));
    }

    if (name === "lower" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).toLowerInvariant());
    }

    if (name === "upper" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).toUpperInvariant());
    }

    if (name === "trim" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).trim());
    }

    if (name === "replace" && args.length >= 3) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const oldStr = TemplateRuntime.toPlainString(args[1]!);
      const newStr = TemplateRuntime.toPlainString(args[2]!);
      return new StringValue(s.replace(oldStr, newStr));
    }

    if (name === "replaceRE" && args.length >= 3) {
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const replacement = TemplateRuntime.toPlainString(args[1]!);
      const s = TemplateRuntime.toPlainString(args[2]!);
      const regex = new Regex(pattern);
      return new StringValue(regex.replace(s, replacement));
    }

    if (name === "truncate" && args.length >= 2) {
      const length = TemplateRuntime.toNumber(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      const ellipsis = args.length >= 3 ? TemplateRuntime.toPlainString(args[2]!) : "...";
      if (s.length <= length) return new StringValue(s);
      const truncLen: int = length - ellipsis.length;
      if (truncLen <= 0) return new StringValue(ellipsis.substring(0, length));
      return new StringValue(s.substring(0, truncLen) + ellipsis);
    }

    if (name === "markdownify" && args.length >= 1) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const md = renderMarkdown(s);
      // Strip wrapping <p> tags for inline use
      let html = md.html.trim();
      if (html.startsWith("<p>") && html.endsWith("</p>")) {
        html = html.substring(3, html.length - 4);
      }
      return new HtmlValue(new HtmlString(html));
    }

    if (name === "relurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      return new StringValue(s.startsWith("/") ? s : "/" + s);
    }

    if (name === "absurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const rel = s.startsWith("/") ? s.substring(1) : s;
      return new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
    }

    if (name === "abslangurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const lang = scope.site.Language.Lang;
      const langPrefix = scope.site.Languages.length > 1 ? lang + "/" : "";
      const rel = s.startsWith("/") ? s.substring(1) : s;
      return new StringValue(ensureTrailingSlash(scope.site.baseURL) + langPrefix + rel);
    }

    if (name === "rellangurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const lang = scope.site.Language.Lang;
      const langPrefix = scope.site.Languages.length > 1 ? "/" + lang : "";
      const path = s.startsWith("/") ? s : "/" + s;
      return new StringValue(langPrefix + path);
    }

    if (name === "urlquery" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      return new StringValue(Uri.escapeDataString(s));
    }

    if (name === "default" && args.length >= 2) {
      const fallback = args[0]!;
      const v = args[1]!;
      return TemplateRuntime.isTruthy(v) ? v : fallback;
    }

    if (name === "len" && args.length >= 1) {
      const v = args[0]!;
      if (v instanceof StringValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof HtmlValue) {
        const l: int = v.value.value.length;
        return new NumberValue(l);
      }
      if (v instanceof PageArrayValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof StringArrayValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof SitesArrayValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof DocsMountArrayValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof NavArrayValue) {
        const l: int = v.value.length;
        return new NumberValue(l);
      }
      if (v instanceof DictValue) {
        return new NumberValue(v.value.count);
      }
      if (v instanceof AnyArrayValue) {
        return new NumberValue(v.value.count);
      }
      return new NumberValue(0);
    }

    if (name === "dateformat" && args.length >= 2) {
      const layout = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      let parsed: DateTime = DateTime.minValue;
      const ok = DateTime.tryParse(s, parsed);
      if (!ok) return new StringValue("");
      const fmt = TemplateRuntime.convertGoDateLayoutToDotNet(layout);
      return new StringValue(parsed.toString(fmt));
    }

    if (name === "print" && args.length >= 1) {
      const sb = new StringBuilder();
      for (let i = 0; i < args.length; i++) sb.append(TemplateRuntime.toPlainString(args[i]!));
      return new StringValue(sb.toString());
    }

    if (name === "printf" && args.length >= 1) {
      const fmt = TemplateRuntime.toPlainString(args[0]!);
      const vals = new List<string>();
      for (let argIndex = 1; argIndex < args.length; argIndex++) vals.add(TemplateRuntime.toPlainString(args[argIndex]!));
      const values = vals.toArray();

      const sb = new StringBuilder();
      let pos = 0;
      let valueIndex = 0;
      while (pos < fmt.length) {
        const ch = fmt.substring(pos, 1);
        if (ch === "%" && pos + 1 < fmt.length) {
          const next = fmt.substring(pos + 1, 1);
          if (next === "%") {
            sb.append("%");
            pos += 2;
            continue;
          }
          if (next === "s") {
            if (valueIndex < values.length) sb.append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
          if (next === "d") {
            if (valueIndex < values.length) sb.append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
        }
        sb.append(ch);
        pos++;
      }

      return new StringValue(sb.toString());
    }

    if (args.length >= 2) {
      const isCompare = name === "eq" || name === "ne" || name === "lt" || name === "le" || name === "gt" || name === "ge";
      if (isCompare) {
        const a = args[0]!;
        const b = args[1]!;

        let cmp = 0;
        // Handle VersionStringValue comparisons using semver semantics
        if (a instanceof VersionStringValue || b instanceof VersionStringValue) {
          const av = TemplateRuntime.toPlainString(a);
          const bv = TemplateRuntime.toPlainString(b);
          cmp = VersionStringValue.compare(av, bv);
        } else if (a instanceof NumberValue) {
          if (b instanceof NumberValue) {
            const av = a.value;
            const bv = b.value;
            cmp = av < bv ? -1 : av > bv ? 1 : 0;
          } else {
            const av = TemplateRuntime.toPlainString(a);
            const bv = TemplateRuntime.toPlainString(b);
            cmp = av.compareTo(bv);
          }
        } else {
          const av = TemplateRuntime.toPlainString(a);
          const bv = TemplateRuntime.toPlainString(b);
          cmp = av.compareTo(bv);
        }

        if (name === "eq") return new BoolValue(cmp === 0);
        if (name === "ne") return new BoolValue(cmp !== 0);
        if (name === "lt") return new BoolValue(cmp < 0);
        if (name === "le") return new BoolValue(cmp <= 0);
        if (name === "gt") return new BoolValue(cmp > 0);
        return new BoolValue(cmp >= 0);
      }
    }

    if (name === "not" && args.length >= 1) {
      return new BoolValue(!TemplateRuntime.isTruthy(args[0]!));
    }

    if (name === "and" && args.length >= 1) {
      let cur = args[0]!;
      for (let i = 0; i < args.length; i++) {
        cur = args[i]!;
        if (!TemplateRuntime.isTruthy(cur)) return cur;
      }
      return cur;
    }

    if (name === "or" && args.length >= 1) {
      for (let i = 0; i < args.length; i++) {
        const cur = args[i]!;
        if (TemplateRuntime.isTruthy(cur)) return cur;
      }
      return args[args.length - 1]!;
    }

    return TemplateRuntime.nil;
    } catch (e) {
      if (e instanceof ReturnException) throw e;
      Console.error.writeLine("Template function failed: {0} ({1})", nameRaw, name);
      throw e;
    }
  }

  /**
   * Dispatch a method call on a receiver value.
   * This handles method calls like `(resources.ByType "image").GetMatch "foo*"`
   * where we have a receiver value and a method name with arguments.
   */
  static callMethod(
    receiver: TemplateValue,
    methodName: string,
    args: TemplateValue[],
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): TemplateValue {
    const method = methodName.toLowerInvariant();

    // Handle AnyArrayValue methods (resource collections, page collections, etc.)
    if (receiver instanceof AnyArrayValue) {
      const arr = receiver.value;

      // GetMatch - find first item matching pattern (for resources)
      if (method === "getmatch" && args.length >= 1) {
        const pattern = TemplateRuntime.toPlainString(args[0]!);
        const items = arr.toArray();
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          if (item instanceof ResourceValue) {
            const res = item.value;
            const name = res.outputRelPath ?? res.id;
            if (TemplateRuntime.globMatch(pattern, name)) {
              return item;
            }
          }
        }
        return TemplateRuntime.nil;
      }

      // Match - filter items matching pattern
      if (method === "match" && args.length >= 1) {
        const pattern = TemplateRuntime.toPlainString(args[0]!);
        const matchResult = new List<TemplateValue>();
        const items = arr.toArray();
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          if (item instanceof ResourceValue) {
            const res = item.value;
            const name = res.outputRelPath ?? res.id;
            if (TemplateRuntime.globMatch(pattern, name)) {
              matchResult.add(item);
            }
          }
        }
        return new AnyArrayValue(matchResult);
      }

      // ByType - filter by media type (using path extension as heuristic)
      if (method === "bytype" && args.length >= 1) {
        const targetType = TemplateRuntime.toPlainString(args[0]!).toLowerInvariant();
        const byTypeResult = new List<TemplateValue>();
        const byTypeItems = arr.toArray();
        for (let i = 0; i < byTypeItems.length; i++) {
          const item = byTypeItems[i]!;
          if (item instanceof ResourceValue) {
            const res = item.value;
            // Determine type from extension
            const path = res.outputRelPath ?? res.id;
            const ext = TemplateRuntime.getPathExtension(path).toLowerInvariant();
            let mainType = "application";
            if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp" || ext === ".svg") {
              mainType = "image";
            } else if (ext === ".css" || ext === ".html" || ext === ".js" || ext === ".json" || ext === ".xml" || ext === ".txt") {
              mainType = "text";
            }
            if (mainType === targetType) byTypeResult.add(item);
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
        const firstResult = new List<PageContext>();
        for (let i = 0; i < pages.length && i < n; i++) firstResult.add(pages[i]!);
        return new PageArrayValue(firstResult.toArray());
      }

      // Limit - same as First
      if (method === "limit" && args.length >= 1) {
        const n = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
        const limitResult = new List<PageContext>();
        for (let i = 0; i < pages.length && i < n; i++) limitResult.add(pages[i]!);
        return new PageArrayValue(limitResult.toArray());
      }
    }

    // Handle PageValue methods
    if (receiver instanceof PageValue) {
      const page = receiver.value;

      // GetTerms - return term pages for a taxonomy
      if (method === "getterms" && args.length >= 1) {
        const taxonomy = TemplateRuntime.toPlainString(args[0]!).toLowerInvariant();
        const site = page.site;
        const termsResult = new List<PageContext>();

        // Get the term values from the page (e.g., tags, categories)
        // Currently only supports built-in tags and categories
        if (taxonomy !== "tags" && taxonomy !== "categories") {
          // Unsupported taxonomy - return empty result
          return new PageArrayValue(termsResult.toArray());
        }
        let termValues: string[];
        if (taxonomy === "tags") {
          termValues = TemplateRuntime.copyStringArray(page.tags);
        } else {
          termValues = TemplateRuntime.copyStringArray(page.categories);
        }
        const allPages = TemplateRuntime.copyPageArray(site.allPages);

        // Find the term pages from site taxonomies
        for (let i = 0; i < termValues.length; i++) {
          const termValue = termValues[i]!;
          // Look for the term page in site.allPages
          const termSlug = termValue.toLowerInvariant().replace(" ", "-");
          for (let j = 0; j < allPages.length; j++) {
            const p = allPages[j]!;
            if (p.kind === "term" && p.section === taxonomy && p.slug === termSlug) {
              termsResult.add(p);
              break;
            }
          }
        }

        return new PageArrayValue(termsResult.toArray());
      }
    }

    // Handle ResourceValue methods
    if (receiver instanceof ResourceValue) {
      // Resize for images
      if (method === "resize" && args.length >= 1) {
        // TODO: Implement actual image resizing
        // For now, return the same resource (placeholder)
        return receiver;
      }
    }

    // Fallback: try to resolve as a zero-arg method/property via resolvePath
    // This handles cases where the method name might be a property
    const result = TemplateRuntime.resolvePath(receiver, [methodName], scope);
    return result;
  }

  private static getPathExtension(path: string): string {
    const lastDot = path.lastIndexOf(".");
    if (lastDot < 0) return "";
    return path.substring(lastDot);
  }

  static toJson(value: TemplateValue): string {
    if (value instanceof NilValue) return "null";
    if (value instanceof BoolValue) return value.value ? "true" : "false";
    if (value instanceof NumberValue) return value.value.toString();
    if (value instanceof StringValue) return TemplateRuntime.toJsonString(value.value);
    if (value instanceof HtmlValue) return TemplateRuntime.toJsonString(value.value.value);
    if (value instanceof AnyArrayValue) {
      const items = value.value;
      const sb = new StringBuilder();
      sb.append("[");
      let first = true;
      const it = items.getEnumerator();
      while (it.moveNext()) {
        if (!first) sb.append(",");
        first = false;
        sb.append(TemplateRuntime.toJson(it.current));
      }
      sb.append("]");
      return sb.toString();
    }
    if (value instanceof DictValue) {
      const sb = new StringBuilder();
      sb.append("{");
      let first = true;
      const it = value.value.getEnumerator();
      while (it.moveNext()) {
        const kv = it.current;
        if (!first) sb.append(",");
        first = false;
        sb.append(TemplateRuntime.toJsonString(kv.key));
        sb.append(":");
        sb.append(TemplateRuntime.toJson(kv.value));
      }
      sb.append("}");
      return sb.toString();
    }
    return "null";
  }

  static toJsonString(value: string): string {
    const sb = new StringBuilder();
    sb.append("\"");
    for (let i = 0; i < value.length; i++) {
      const ch = value.substring(i, 1);
      if (ch === "\\") sb.append("\\\\");
      else if (ch === "\"") sb.append("\\\"");
      else if (ch === "\n") sb.append("\\n");
      else if (ch === "\r") sb.append("\\r");
      else if (ch === "\t") sb.append("\\t");
      else sb.append(ch);
    }
    sb.append("\"");
    return sb.toString();
  }

  static bytesToHex(bytes: byte[]): string {
    const hexChars = "0123456789abcdef";
    const sb = new StringBuilder();
    for (let i = 0; i < bytes.length; i++) {
      const b: int = bytes[i]!;
      sb.append(hexChars.substring((b >> 4) & 0xf, 1));
      sb.append(hexChars.substring(b & 0xf, 1));
    }
    return sb.toString();
  }

  static parseUrl(value: string): Uri {
    const trimmed = value.trim();
    try {
      return new Uri(trimmed, UriKind.relativeOrAbsolute);
    } catch (e) {
      return new Uri("about:blank", UriKind.absolute);
    }
  }

  static trimStartChar(value: string, ch: string): string {
    let start = 0;
    while (start < value.length && value.substring(start, 1) === ch) start++;
    return value.substring(start);
  }

  static trimEndChar(value: string, ch: string): string {
    let end = value.length;
    while (end > 0 && value.substring(end - 1, 1) === ch) end--;
    return value.substring(0, end);
  }

  static trimSlashes(value: string): string {
    const withoutLeading = TemplateRuntime.trimStartChar(value, "/");
    return TemplateRuntime.trimEndChar(withoutLeading, "/");
  }

  static trimRightWhitespace(s: string): string {
    return s.trimEnd();
  }

  static parseTemplateText(template: string): Template {
    const segs = TemplateRuntime.scanSegments(template);
    const parser = new Parser(segs);
    const root = parser.parseNodes(false);
    return new Template(root.nodes, parser.defines);
  }

  static scanSegments(template: string): Segment[] {
    const segs = new List<Segment>();
    let i = 0;
    let lastSegment: Segment | undefined = undefined;

    while (i < template.length) {
      const start = indexOfTextFrom(template, "{{", i);
      if (start < 0) {
        const textSegment = new Segment(false, template.substring(i));
        segs.add(textSegment);
        lastSegment = textSegment;
        break;
      }

      if (start > i) {
        const textSegment = new Segment(false, template.substring(i, start - i));
        segs.add(textSegment);
        lastSegment = textSegment;
      }

      const end = indexOfTextFrom(template, "}}", start + 2);
      if (end < 0) {
        const textSegment = new Segment(false, template.substring(start));
        segs.add(textSegment);
        lastSegment = textSegment;
        break;
      }

      let action = template.substring(start + 2, end - (start + 2));
      let leftTrim = false;
      let rightTrim = false;

      if (action.startsWith("-")) {
        leftTrim = true;
        action = action.substring(1);
      }

      if (action.endsWith("-")) {
        rightTrim = true;
        action = action.substring(0, action.length - 1);
      }

      action = action.trim();

      if (leftTrim && lastSegment !== undefined && !lastSegment.isAction) {
        segs.removeAt(segs.count - 1);
        const trimmedTextSegment = new Segment(false, TemplateRuntime.trimRightWhitespace(lastSegment.text));
        segs.add(trimmedTextSegment);
        lastSegment = trimmedTextSegment;
      }

      const actionSegment = new Segment(true, action);
      segs.add(actionSegment);
      lastSegment = actionSegment;
      i = end + 2;

      if (rightTrim) {
        while (i < template.length) {
          const ch = template.substring(i, 1);
          if (ch !== " " && ch !== "\t" && ch !== "\r" && ch !== "\n") break;
          i++;
        }
      }
    }

    return segs.toArray();
  }

  static tokenizeAction(action: string): string[] {
    const tokens = new List<string>();
    let i = 0;

    const push = (t: string): void => {
      if (t !== "") tokens.add(t);
    };

    while (i < action.length) {
      const ch = action.substring(i, 1);
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        i++;
        continue;
      }
      if (ch === "|") {
        tokens.add("|");
        i++;
        continue;
      }
      if (ch === "(" || ch === ")" || ch === ",") {
        tokens.add(ch);
        i++;
        continue;
      }
      if (ch === ":" && i + 1 < action.length && action.substring(i + 1, 1) === "=") {
        tokens.add(":=");
        i += 2;
        continue;
      }
      if (ch === "=") {
        tokens.add("=");
        i++;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        const quote = ch;
        i++;
        const quotedStart = i;
        while (i < action.length && action.substring(i, 1) !== quote) i++;
        const value = action.substring(quotedStart, i - quotedStart);
        push(quote + value + quote);
        if (i < action.length) i++;
        continue;
      }
      if (ch === "`") {
        const quote = ch;
        i++;
        const quotedStart = i;
        while (i < action.length && action.substring(i, 1) !== quote) i++;
        const value = action.substring(quotedStart, i - quotedStart);
        push(quote + value + quote);
        if (i < action.length) i++;
        continue;
      }

      const tokenStart = i;
      while (i < action.length) {
        const c = action.substring(i, 1);
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "|" || c === "(" || c === ")" || c === "," || c === "=") break;
        if (c === ":" && i + 1 < action.length && action.substring(i + 1, 1) === "=") break;
        i++;
      }
      push(action.substring(tokenStart, i - tokenStart));
    }

    return tokens.toArray();
  }

  static parsePipeline(tokens: string[]): Pipeline {
    const parser = new PipelineParser(tokens);
    return parser.parsePipeline(false);
  }

  static sliceTokens(tokens: string[], startIndex: int): string[] {
    const out = new List<string>();
    for (let i = startIndex; i < tokens.length; i++) out.add(tokens[i]!);
    return out.toArray();
  }
}

class ReturnException extends Exception {
  readonly value: TemplateValue;

  constructor(value: TemplateValue) {
    super("template return");
    this.value = value;
  }
}


export class Expr {
  eval(
    _scope: RenderScope,
    _env: TemplateEnvironment,
    _overrides: Dictionary<string, TemplateNode[]>,
    _defines: Dictionary<string, TemplateNode[]>,
  ): TemplateValue {
    throw new Exception("Expr.eval is not implemented");
  }
}

class TokenExpr extends Expr {
  readonly token: string;

  constructor(token: string) {
    super();
    this.token = token;
  }

  override eval(scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>, defines: Dictionary<string, TemplateNode[]>): TemplateValue {
    const t = this.token.trim();
    if (
      t === "." ||
      t === "$" ||
      t.startsWith(".") ||
      t.startsWith("$") ||
      t.startsWith("site") ||
      TemplateRuntime.parseStringLiteral(t) !== undefined ||
      t === "true" ||
      t === "false" ||
      TemplateRuntime.isNumberLiteral(t)
    ) return TemplateRuntime.evalToken(t, scope);
    return TemplateRuntime.callFunction(t, [], scope, env, overrides, defines);
  }
}

class PipelineExpr extends Expr {
  readonly pipeline: Pipeline;

  constructor(pipeline: Pipeline) {
    super();
    this.pipeline = pipeline;
  }

  override eval(scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>, defines: Dictionary<string, TemplateNode[]>): TemplateValue {
    return this.pipeline.eval(scope, env, overrides, defines);
  }
}

class AccessExpr extends Expr {
  readonly base: Expr;
  readonly segments: string[];

  constructor(base: Expr, segments: string[]) {
    super();
    this.base = base;
    this.segments = segments;
  }

  override eval(scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>, defines: Dictionary<string, TemplateNode[]>): TemplateValue {
    const v = this.base.eval(scope, env, overrides, defines);
    return TemplateRuntime.resolvePath(v, this.segments, scope);
  }
}

class PipelineParser {
  readonly tokens: string[];
  idx: int;

  constructor(tokens: string[]) {
    this.tokens = tokens;
    this.idx = 0;
  }

  parsePipeline(stopOnRightParen: boolean): Pipeline {
    const stages = new List<Command>();
    while (this.idx < this.tokens.length) {
      const t = this.tokens[this.idx]!;
      if (stopOnRightParen && t === ")") break;
      if (t === "|") {
        this.idx++;
        continue;
      }
      stages.add(this.parseCommand());
      if (this.idx < this.tokens.length && this.tokens[this.idx]! === "|") this.idx++;
    }
    return new Pipeline(stages.toArray());
  }

  private parseCommand(): Command {
    const head = this.parseExpr();
    const args = new List<Expr>();

    while (this.idx < this.tokens.length) {
      const t = this.tokens[this.idx]!;
      if (t === "|" || t === ")") break;
      args.add(this.parseExpr());
    }

    return new Command(head, args.toArray());
  }

  private parseExpr(): Expr {
    if (this.idx >= this.tokens.length) return new TokenExpr("");
    const t = this.tokens[this.idx]!;

    if (t === "(") {
      this.idx++;
      const inner = this.parsePipeline(true);
      if (this.idx < this.tokens.length && this.tokens[this.idx]! === ")") this.idx++;
      let expr: Expr = new PipelineExpr(inner);
      while (this.idx < this.tokens.length) {
        const next = this.tokens[this.idx]!;
        if (next.startsWith(".") && next !== ".") {
          const segs = next.substring(1).split(".");
          expr = new AccessExpr(expr, segs);
          this.idx++;
          continue;
        }
        break;
      }
      return expr;
    }

    this.idx++;
    return new TokenExpr(t);
  }
}

export class Command {
  readonly head: Expr;
  readonly args: Expr[];

  constructor(head: Expr, args: Expr[]) {
    this.head = head;
    this.args = args;
  }

  eval(
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
    piped: TemplateValue | undefined,
  ): TemplateValue {
    if (this.args.length === 0 && piped === undefined) return this.head.eval(scope, env, overrides, defines);

    const head = this.head;
    if (head instanceof TokenExpr) {
      const tokenExpr = head as TokenExpr;
      const evaluatedArgs = new List<TemplateValue>();
      for (let i = 0; i < this.args.length; i++) evaluatedArgs.add(this.args[i]!.eval(scope, env, overrides, defines));
      if (piped !== undefined) evaluatedArgs.add(piped);
      return TemplateRuntime.callFunction(tokenExpr.token, evaluatedArgs.toArray(), scope, env, overrides, defines);
    }

    // Handle AccessExpr with args - method invocation on expression result
    // Example: (resources.ByType "image").GetMatch "foo*"
    if (head instanceof AccessExpr) {
      const accessExpr = head as AccessExpr;
      const segments = accessExpr.segments;
      if (segments.length >= 1) {
        // Evaluate the receiver (base + all segments except last)
        let receiver = accessExpr.base.eval(scope, env, overrides, defines);
        if (segments.length > 1) {
          const receiverSegs: string[] = [];
          for (let i = 0; i < segments.length - 1; i++) receiverSegs[i] = segments[i]!;
          receiver = TemplateRuntime.resolvePath(receiver, receiverSegs, scope);
        }
        // The last segment is the method name
        const methodName = segments[segments.length - 1]!;
        // Evaluate args
        const evaluatedArgs = new List<TemplateValue>();
        for (let i = 0; i < this.args.length; i++) evaluatedArgs.add(this.args[i]!.eval(scope, env, overrides, defines));
        if (piped !== undefined) evaluatedArgs.add(piped);
        // Dispatch the method call
        return TemplateRuntime.callMethod(receiver, methodName, evaluatedArgs.toArray(), scope, env, overrides, defines);
      }
    }

    const headValue = this.head.eval(scope, env, overrides, defines);
    return piped !== undefined ? piped : headValue;
  }
}

class ParseNodesResult {
  readonly nodes: TemplateNode[];
  readonly endedWithElse: boolean;

  constructor(nodes: TemplateNode[], endedWithElse: boolean) {
    this.nodes = nodes;
    this.endedWithElse = endedWithElse;
  }
}

class Parser {
  readonly segs: Segment[];
  idx: int;
  readonly defines: Dictionary<string, TemplateNode[]>;
  private lastElseTokens: string[] | undefined;

  constructor(segs: Segment[]) {
    this.segs = segs;
    this.idx = 0;
    this.defines = new Dictionary<string, TemplateNode[]>();
    this.lastElseTokens = undefined;
  }

  private takeElseTokens(): string[] {
    const empty: string[] = [];
    const t = this.lastElseTokens ?? empty;
    this.lastElseTokens = undefined;
    return t;
  }

  private parseIfFrom(cond: Pipeline): IfNode {
    const thenBody = this.parseNodes(true);
    let elseNodes: TemplateNode[] = [];
    if (thenBody.endedWithElse) {
      const elseTokens = this.takeElseTokens();
      let isElseIf = false;
      if (elseTokens.length >= 2) isElseIf = elseTokens[1] === "if";
      if (isElseIf === true) {
        const elseCond = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(elseTokens, 2));
        const nested = this.parseIfFrom(elseCond);
        elseNodes = [nested];
      } else {
        const elseBody = this.parseNodes(false);
        elseNodes = elseBody.nodes;
      }
    }
    return new IfNode(cond, thenBody.nodes, elseNodes);
  }

  parseNodes(stopOnElse: boolean): ParseNodesResult {
    const nodes = new List<TemplateNode>();

    while (this.idx < this.segs.length) {
      const seg = this.segs[this.idx]!;
      this.idx++;

      if (!seg.isAction) {
        nodes.add(new TextNode(seg.text));
        continue;
      }

      if (seg.text.startsWith("/*") && seg.text.endsWith("*/")) {
        continue;
      }

      const tokens = TemplateRuntime.tokenizeAction(seg.text);
      if (tokens.length === 0) continue;

      const head = tokens[0]!;
      if (head === "end") return new ParseNodesResult(nodes.toArray(), false);
      if (head === "else") {
        if (stopOnElse) {
          this.lastElseTokens = tokens;
          return new ParseNodesResult(nodes.toArray(), true);
        }
        continue;
      }

      if (head === "define" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const body = this.parseNodes(false);
        this.defines.remove(name);
        this.defines.add(name, body.nodes);
        continue;
      }

      if (head === "block" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        const ctx = TemplateRuntime.parsePipeline(ctxTokens);
        const body = this.parseNodes(false);
        nodes.add(new BlockNode(name, ctx, body.nodes));
        continue;
      }

      if (head === "if") {
        const cond = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        nodes.add(this.parseIfFrom(cond));
        continue;
      }

      if (head === "with") {
        const expr = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        const body = this.parseNodes(true);
        let elseNodes: TemplateNode[] = [];
        if (body.endedWithElse) {
          this.takeElseTokens();
          const elseBody = this.parseNodes(false);
          elseNodes = elseBody.nodes;
        }
        nodes.add(new WithNode(expr, body.nodes, elseNodes));
        continue;
      }

      if (head === "range") {
        let idx = 1;
        let keyVar: string | undefined = undefined;
        let valueVar: string | undefined = undefined;

        const first = idx < tokens.length ? tokens[idx]! : "";
        const isVar = first.startsWith("$") && first !== "$" && !first.startsWith("$.");
        let hasDeclare = false;
        if (idx + 1 < tokens.length) {
          const tok1 = tokens[idx + 1]!;
          hasDeclare = tok1 === ":=" || tok1 === "=";
        }
        let hasKeyValueDeclare = false;
        if (idx + 3 < tokens.length) {
          const tok0 = tokens[idx]!;
          const tok1 = tokens[idx + 1]!;
          const tok2 = tokens[idx + 2]!;
          const tok3 = tokens[idx + 3]!;
          const isKvDeclareOp = tok3 === ":=" || tok3 === "=";
          hasKeyValueDeclare = tok0.startsWith("$") && tok1 === "," && tok2.startsWith("$") && isKvDeclareOp;
        }

        let exprTokens: string[] = [];
        if (hasKeyValueDeclare) {
          keyVar = tokens[idx]!.substring(1);
          valueVar = tokens[idx + 2]!.substring(1);
          idx += 4;
          exprTokens = TemplateRuntime.sliceTokens(tokens, idx);
        } else if (isVar && hasDeclare) {
          valueVar = tokens[idx]!.substring(1);
          idx += 2;
          exprTokens = TemplateRuntime.sliceTokens(tokens, idx);
        } else {
          exprTokens = TemplateRuntime.sliceTokens(tokens, 1);
        }

        const expr = TemplateRuntime.parsePipeline(exprTokens);
        const body = this.parseNodes(true);
        let elseNodes: TemplateNode[] = [];
        if (body.endedWithElse) {
          this.takeElseTokens();
          const elseBody = this.parseNodes(false);
          elseNodes = elseBody.nodes;
        }
        nodes.add(new RangeNode(expr, keyVar, valueVar, body.nodes, elseNodes));
        continue;
      }

      if (head === "template" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        nodes.add(new TemplateInvokeNode(name, TemplateRuntime.parsePipeline(ctxTokens)));
        continue;
      }

      if (tokens.length >= 3 && head.startsWith("$") && head !== "$" && !head.startsWith("$.")) {
        const tok1 = tokens[1]!;
        if (tok1 === ":=" || tok1 === "=") {
          const name = head.substring(1);
          const declare = tok1 === ":=";
          const expr = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 2));
          nodes.add(new AssignmentNode(name, expr, declare));
          continue;
        }
      }

      nodes.add(new OutputNode(TemplateRuntime.parsePipeline(tokens), true));
    }

    return new ParseNodesResult(nodes.toArray(), false);
  }
}

// Re-export helper functions
export const parseStringLiteral = TemplateRuntime.parseStringLiteral;
export const parsePipeline = TemplateRuntime.parsePipeline;
export const sliceTokens = TemplateRuntime.sliceTokens;
export const tokenizeAction = TemplateRuntime.tokenizeAction;
export const scanSegments = TemplateRuntime.scanSegments;
export const parseTemplateText = TemplateRuntime.parseTemplateText;

export function parseTemplate(template: string): Template {
  return TemplateRuntime.parseTemplateText(template);
}
