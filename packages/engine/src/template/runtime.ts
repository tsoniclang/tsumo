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
    if (this.stages.Length === 0) return TemplateRuntime.nil;

    let value = this.stages[0]!.eval(scope, env, overrides, defines, undefined);
    for (let i = 1; i < this.stages.Length; i++) {
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

    if (value instanceof DictValue) return value.value.Count > 0;
    if (value instanceof PageArrayValue) return value.value.Length > 0;
    if (value instanceof StringArrayValue) return value.value.Length > 0;
    if (value instanceof SitesArrayValue) return value.value.Length > 0;
    if (value instanceof DocsMountArrayValue) return value.value.Length > 0;
    if (value instanceof NavArrayValue) return value.value.Length > 0;
    if (value instanceof AnyArrayValue) return value.value.Count > 0;

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
      return value.value.ToString();
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
      if (Int32.TryParse(value.value, parsed)) return parsed;
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
      return value.value.ToString();
    }
    return "";
  }

  static parseStringLiteral(token: string): string | undefined {
    const t = token.Trim();
    if (
      t.Length >= 2 &&
      ((t.StartsWith("\"") && t.EndsWith("\"")) || (t.StartsWith("'") && t.EndsWith("'")) || (t.StartsWith("`") && t.EndsWith("`")))
    ) {
      return t.Substring(1, t.Length - 2);
    }
    return undefined;
  }

  static isNumberLiteral(token: string): boolean {
    if (token === "") return false;
    let parsed: int = 0;
    return Int32.TryParse(token, parsed);
  }

  static resolvePath(value: TemplateValue, segments: string[], scope: RenderScope): TemplateValue {
    let cur: TemplateValue = value;
    for (let i = 0; i < segments.Length; i++) {
      const seg = segments[i]!;
      if (cur instanceof NilValue) return TemplateRuntime.nil;

      if (cur instanceof PageValue) {
        const page = cur.value;
        const k = seg.ToLowerInvariant();
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
        else if (k === "layout") cur = page.layout !== undefined && page.layout.Trim() !== "" ? new StringValue(page.layout) : TemplateRuntime.nil;
        else if (k === "file") cur = page.File !== undefined ? new FileValue(page.File) : TemplateRuntime.nil;
        else if (k === "language") cur = new LanguageValue(page.Language);
        else if (k === "translations") cur = new PageArrayValue(page.Translations);
        else if (k === "store") cur = new ScratchValue(TemplateRuntime.getPageStore(page));
        else if (k === "sites") cur = new SitesValue(scope.site);
        else if (k === "page") cur = cur;
        else if (k === "parent") cur = page.parent !== undefined ? new PageValue(page.parent) : TemplateRuntime.nil;
        else if (k === "ancestors") cur = new PageArrayValue(page.ancestors);
        else if (k === "permalink") {
          const rel = page.relPermalink.StartsWith("/") ? page.relPermalink.Substring(1) : page.relPermalink;
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
            for (let pi = 0; pi < siblings.Length; pi++) {
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
            for (let ni = 0; ni < siblings.Length; ni++) {
              const sibling = siblings[ni]!;
              if (sibling.relPermalink === page.relPermalink) {
                foundIdx = ni;
                break;
              }
            }
            if (foundIdx >= 0 && foundIdx < siblings.Length - 1) {
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
        const k = seg.ToLowerInvariant();
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
        const k = seg.ToLowerInvariant();
        if (k === "lang") cur = new StringValue(lang.Lang);
        else if (k === "languagename") cur = new StringValue(lang.LanguageName);
        else if (k === "languagedirection") cur = new StringValue(lang.LanguageDirection);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof FileValue) {
        const f = cur.value;
        const k = seg.ToLowerInvariant();
        if (k === "filename") cur = new StringValue(f.Filename);
        else if (k === "dir") cur = new StringValue(f.Dir);
        else if (k === "basefilename") cur = new StringValue(f.BaseFileName);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof SitesValue) {
        const k = seg.ToLowerInvariant();
        if (k === "default") cur = new SiteValue(cur.value);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof MenusValue) {
        const site = cur.site;
        let entries: MenuEntry[] = [];
        const hasMenu = site.Menus.TryGetValue(seg, entries);
        if (hasMenu) {
          cur = new MenuArrayValue(entries, site);
        } else {
          const lowerSeg = seg.ToLowerInvariant();
          const hasMenuLower = site.Menus.TryGetValue(lowerSeg, entries);
          cur = hasMenuLower ? new MenuArrayValue(entries, site) : TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof MenuEntryValue) {
        const entry = cur.value;
        const site = cur.site;
        const k = seg.ToLowerInvariant();
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
        const k = seg.ToLowerInvariant();
        if (k === "get") {
          cur = new OutputFormatsGetValue(site);
        } else {
          cur = TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof OutputFormatValue) {
        const fmt = cur.value;
        const k = seg.ToLowerInvariant();
        if (k === "rel") cur = new StringValue(fmt.Rel);
        else if (k === "mediatype") cur = TemplateRuntime.wrapMediaType(fmt.MediaType);
        else if (k === "permalink") cur = new StringValue(fmt.Permalink);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof MediaTypeValue) {
        const mt = cur.value;
        const k = seg.ToLowerInvariant();
        if (k === "type") cur = new StringValue(mt.Type);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof ShortcodeValue) {
        const sc = cur.value;
        const k = seg.ToLowerInvariant();
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
        const k = seg.ToLowerInvariant();
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
        const k = seg.ToLowerInvariant();
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
        const k = seg.ToLowerInvariant();
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
        const found = site.Taxonomies.TryGetValue(seg, terms);
        if (found) {
          cur = new TaxonomyTermsValue(terms, site);
        } else {
          const lowerSeg = seg.ToLowerInvariant();
          const foundLower = site.Taxonomies.TryGetValue(lowerSeg, terms);
          cur = foundLower ? new TaxonomyTermsValue(terms, site) : TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof TaxonomyTermsValue) {
        const termsDict = cur.terms;
        const site = cur.site;
        let pages: PageContext[] = [];
        const found = termsDict.TryGetValue(seg, pages);
        if (found) {
          cur = new PageArrayValue(pages);
        } else {
          cur = TemplateRuntime.nil;
        }
        continue;
      }

      if (cur instanceof UrlValue) {
        const uri = cur.value;
        const k = seg.ToLowerInvariant();
        if (k === "isabs") {
          cur = new BoolValue(uri.IsAbsoluteUri);
          continue;
        }
        if (k === "host") {
          // Hugo returns empty string for relative URIs, not an exception
          cur = new StringValue(uri.IsAbsoluteUri ? uri.Host : "");
          continue;
        }
        if (k === "scheme") {
          // Hugo returns empty string for relative URIs
          cur = new StringValue(uri.IsAbsoluteUri ? uri.Scheme : "");
          continue;
        }
        if (k === "string") {
          // Return the original string representation
          cur = new StringValue(uri.OriginalString);
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
        const k = seg.ToLowerInvariant();
        if (k === "content") {
          cur = new StringValue(res.text ?? "");
          continue;
        }
        if (k === "data") {
          cur = new ResourceDataValue(res.Data);
          continue;
        }
        if (k === "relpermalink") {
          if (res.outputRelPath === undefined || res.outputRelPath.Trim() === "") {
            cur = TemplateRuntime.nil;
            continue;
          }
          rv.manager.ensurePublished(res);
          const slash: char = "/";
          const rel = res.outputRelPath.TrimStart(slash);
          cur = new StringValue("/" + rel);
          continue;
        }
        if (k === "permalink") {
          if (res.outputRelPath === undefined || res.outputRelPath.Trim() === "") {
            cur = TemplateRuntime.nil;
            continue;
          }
          rv.manager.ensurePublished(res);
          const slash: char = "/";
          const rel = res.outputRelPath.TrimStart(slash);
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
        const k = seg.ToLowerInvariant();
        if (k === "integrity") {
          cur = new StringValue(data.Integrity);
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof DocsMountValue) {
        const mount = cur.value;
        const k = seg.ToLowerInvariant();
        if (k === "name") cur = new StringValue(mount.name);
        else if (k === "urlprefix") cur = new StringValue(mount.urlPrefix);
        else if (k === "nav") cur = new NavArrayValue(mount.nav);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof NavItemValue) {
        const item = cur.value;
        const k = seg.ToLowerInvariant();
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
        const hasDirect = dict.TryGetValue(seg, direct);
        if (hasDirect) {
          cur = direct;
          continue;
        }
        const lowerKey = seg.ToLowerInvariant();
        let lower: TemplateValue = TemplateRuntime.nil;
        const hasLower = dict.TryGetValue(lowerKey, lower);
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
        const k = seg.ToLowerInvariant();

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
          cur = new NumberValue(pages.Length);
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
    const it = dict.GetEnumerator();
    while (it.MoveNext()) {
      const kv = it.Current;
      mapped.Remove(kv.Key);
      mapped.Add(kv.Key, new StringValue(kv.Value));
    }
    return new DictValue(mapped);
  }

  static wrapParamDict(dict: Dictionary<string, ParamValue>): DictValue {
    const mapped = new Dictionary<string, TemplateValue>();
    const it = dict.GetEnumerator();
    while (it.MoveNext()) {
      const kv = it.Current;
      const pv = kv.Value;
      const kind = pv.kind;
      let tv: TemplateValue = new StringValue(pv.stringValue);
      if (kind === ParamKind.Bool) tv = new BoolValue(pv.boolValue);
      if (kind === ParamKind.Number) tv = new NumberValue(pv.numberValue);
      mapped.Remove(kv.Key);
      mapped.Add(kv.Key, tv);
    }
    return new DictValue(mapped);
  }

  static wrapLanguages(languages: LanguageContext[]): AnyArrayValue {
    const items = new List<TemplateValue>();
    for (let i = 0; i < languages.Length; i++) items.Add(new LanguageValue(languages[i]!));
    return new AnyArrayValue(items);
  }

  static wrapMediaType(mt: MediaType): MediaTypeValue {
    return new MediaTypeValue(mt);
  }

  static getPageStore(page: PageContext): ScratchStore {
    let existing = new ScratchStore();
    const has = TemplateRuntime.pageStores.TryGetValue(page, existing);
    if (has) return existing;
    const store = new ScratchStore();
    TemplateRuntime.pageStores.Remove(page);
    TemplateRuntime.pageStores.Add(page, store);
    return store;
  }

  static getSiteStore(site: SiteContext): ScratchStore {
    let existing = new ScratchStore();
    const has = TemplateRuntime.siteStores.TryGetValue(site, existing);
    if (has) return existing;
    const store = new ScratchStore();
    TemplateRuntime.siteStores.Remove(site);
    TemplateRuntime.siteStores.Add(site, store);
    return store;
  }

  static splitUrlParts(uri: Uri): UrlParts {
    let rawQuery = "";
    let fragment = "";
    if (uri.IsAbsoluteUri) {
      rawQuery = uri.Query.StartsWith("?") ? uri.Query.Substring(1) : uri.Query;
      fragment = uri.Fragment.StartsWith("#") ? uri.Fragment.Substring(1) : uri.Fragment;
      return new UrlParts(uri.AbsolutePath, rawQuery, fragment);
    }

    const raw = uri.OriginalString;
    const hashIndex = raw.IndexOf("#");
    const beforeHash = hashIndex >= 0 ? raw.Substring(0, hashIndex) : raw;
    fragment = hashIndex >= 0 ? raw.Substring(hashIndex + 1) : "";

    const queryIndex = beforeHash.IndexOf("?");
    const path = queryIndex >= 0 ? beforeHash.Substring(0, queryIndex) : beforeHash;
    rawQuery = queryIndex >= 0 ? beforeHash.Substring(queryIndex + 1) : "";

    return new UrlParts(path, rawQuery, fragment);
  }

  static normalizeRelPath(raw: string): string {
    const normalized = replaceText(raw, "\\", "/");
    const parts = normalized.Split("/");
    const outParts = new List<string>();
    for (let i = 0; i < parts.Length; i++) {
      const p = parts[i]!.Trim();
      if (p === "" || p === ".") continue;
      if (p === "..") {
        if (outParts.Count > 0) outParts.RemoveAt(outParts.Count - 1);
        continue;
      }
      outParts.Add(p);
    }
    const arr = outParts.ToArray();
    let out = "";
    for (let i = 0; i < arr.Length; i++) out = out === "" ? arr[i]! : out + "/" + arr[i]!;
    return out;
  }

  private static segmentMatch(pattern: string, segment: string): boolean {
    if (pattern === "*") return true;
    const star = pattern.IndexOf("*");
    if (star < 0) return pattern === segment;

    const parts = pattern.Split("*");
    let pos = 0;
    for (let i = 0; i < parts.Length; i++) {
      const p = parts[i]!;
      if (p === "") continue;
      const idx = segment.IndexOf(p, pos);
      if (idx < 0) return false;
      if (i === 0 && !pattern.StartsWith("*") && idx !== 0) return false;
      pos = idx + p.Length;
    }
    if (!pattern.EndsWith("*") && pos !== segment.Length) return false;
    return true;
  }

  private static splitGlobSegments(raw: string): string[] {
    const slash: char = "/";
    const normalized = replaceText(raw.Trim(), "\\", "/").TrimStart(slash);
    if (normalized === "") {
      const empty: string[] = [];
      return empty;
    }
    return normalized.Split("/");
  }

  private static globMatchAt(patSegs: string[], pathSegs: string[], pi: int, si: int): boolean {
    if (pi >= patSegs.Length) return si >= pathSegs.Length;
    const p = patSegs[pi]!;
    if (p === "**") {
      for (let i = si; i <= pathSegs.Length; i++) {
        if (TemplateRuntime.globMatchAt(patSegs, pathSegs, pi + 1, i)) return true;
      }
      return false;
    }
    if (si >= pathSegs.Length) return false;
    if (!TemplateRuntime.segmentMatch(p, pathSegs[si]!)) return false;
    return TemplateRuntime.globMatchAt(patSegs, pathSegs, pi + 1, si + 1);
  }

  static globMatch(patternRaw: string, pathRaw: string): boolean {
    const patSegs = TemplateRuntime.splitGlobSegments(patternRaw);
    const pathSegs = TemplateRuntime.splitGlobSegments(pathRaw);
    return TemplateRuntime.globMatchAt(patSegs, pathSegs, 0, 0);
  }

  static resolvePageRef(page: PageContext, ref: string): string {
    const raw = ref.Trim();
    if (raw === "" || raw === "/") return "";
    if (raw.StartsWith("/")) return TemplateRuntime.trimSlashes(raw);
    const base = page.File !== undefined ? page.File.Dir : TemplateRuntime.trimSlashes(page.relPermalink);
    const combined =
      base === "" ? raw : TemplateRuntime.trimEndChar(base, "/") + "/" + TemplateRuntime.trimStartChar(raw, "/");
    return TemplateRuntime.normalizeRelPath(combined);
  }

  static tryGetPage(site: SiteContext, pathRaw: string): PageContext | undefined {
    const trimmed = pathRaw.Trim();
    if (trimmed === "" || trimmed === "/") return site.home;
    const needle = TemplateRuntime.trimSlashes(trimmed);
    if (needle === "") return site.home;
    let candidates: PageContext[] = site.pages;
    if (site.allPages.Length > 0) candidates = site.allPages;
    for (let i = 0; i < candidates.Length; i++) {
      const p = candidates[i]!;
      if (TemplateRuntime.trimSlashes(p.relPermalink) === needle) return p;
      if (p.slug === needle) return p;
    }
    return undefined;
  }

  static toTitleCase(text: string): string {
    const trimmed = text.Trim();
    if (trimmed === "") return "";
    const parts = trimmed.Split(" ");
    const sb = new StringBuilder();
    for (let i = 0; i < parts.Length; i++) {
      const word = parts[i]!;
      if (word.Trim() === "") continue;
      if (sb.Length > 0) sb.Append(" ");
      const first = word.Substring(0, 1).ToUpperInvariant();
      const rest = word.Length > 1 ? word.Substring(1).ToLowerInvariant() : "";
      sb.Append(first);
      sb.Append(rest);
    }
    return sb.ToString();
  }

  static toPages(value: TemplateValue): PageContext[] {
    if (value instanceof PageArrayValue) return value.value;
    if (value instanceof AnyArrayValue) {
      const out = new List<PageContext>();
      const it = value.value.GetEnumerator();
      while (it.MoveNext()) {
        const cur = it.Current;
        if (cur instanceof PageValue) out.Add((cur as PageValue).value);
      }
      return out.ToArray();
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
    for (let i = 0; i < pages.Length; i++) copy.Add(pages[i]!);

    // Simple bubble sort for stability and tsonic compatibility
    const arr = copy.ToArray();
    const len = arr.Length;
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i - 1; j++) {
        const a = arr[j]!;
        const b = arr[j + 1]!;
        // Use date for all fields (publishdate falls back to date)
        const dateA = field === "lastmod" ? a.lastmod : a.date;
        const dateB = field === "lastmod" ? b.lastmod : b.date;
        // Compare dates (ascending order)
        if (dateA.CompareTo(dateB) > 0) {
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
    for (let i = 0; i < pages.Length; i++) copy.Add(pages[i]!);

    // Simple bubble sort
    const arr = copy.ToArray();
    const len = arr.Length;
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len - i - 1; j++) {
        const a = arr[j]!;
        const b = arr[j + 1]!;
        if (a.title.CompareTo(b.title) > 0) {
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
    for (let i = 0; i < pages.Length; i++) copy.Add(pages[i]!);
    return copy.ToArray();
  }

  /**
   * Reverse the order of pages. Returns a new reversed array.
   */
  static reversePages(pages: PageContext[]): PageContext[] {
    const len = pages.Length;
    const reversed = new List<PageContext>();
    for (let i = len - 1; i >= 0; i--) reversed.Add(pages[i]!);
    return reversed.ToArray();
  }

  /**
   * Copy a page array to a new array.
   */
  static copyPageArray(pages: PageContext[]): PageContext[] {
    const copy = new List<PageContext>();
    for (let i = 0; i < pages.Length; i++) copy.Add(pages[i]!);
    return copy.ToArray();
  }

  /**
   * Copy a string array to a new array.
   */
  static copyStringArray(strings: string[]): string[] {
    const copy = new List<string>();
    for (let i = 0; i < strings.Length; i++) copy.Add(strings[i]!);
    return copy.ToArray();
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
      return aStr.CompareTo(bStr);
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
    return aPlain.CompareTo(bPlain);
  }

  static matchWhere(actual: TemplateValue, op: string, expected: TemplateValue): boolean {
    const opLower = op.Trim().ToLowerInvariant();
    const actualText = TemplateRuntime.toPlainString(actual);

    if (opLower === "eq" || opLower === "==") {
      return actualText === TemplateRuntime.toPlainString(expected);
    }
    if (opLower === "ne" || opLower === "!=") {
      return actualText !== TemplateRuntime.toPlainString(expected);
    }
    if (opLower === "in") {
      if (expected instanceof AnyArrayValue) {
        const it = expected.value.GetEnumerator();
        while (it.MoveNext()) {
          if (TemplateRuntime.toPlainString(it.Current) === actualText) return true;
        }
        return false;
      }
      if (expected instanceof StringArrayValue) {
        for (let i = 0; i < expected.value.Length; i++) {
          if (expected.value[i]! === actualText) return true;
        }
        return false;
      }
      if (expected instanceof DictValue) {
        let v: TemplateValue = TemplateRuntime.nil;
        return expected.value.TryGetValue(actualText, v);
      }
      return false;
    }
    if (opLower === "not in") {
      return !TemplateRuntime.matchWhere(actual, "in", expected);
    }

    return false;
  }

  static evalToken(token: string, scope: RenderScope): TemplateValue {
    const t = token.Trim();
    if (t === ".") return scope.dot;
    if (t === "$") return scope.root;
    if (t.StartsWith("$.")) {
      const segs = t.Substring(2).Split(".");
      return TemplateRuntime.resolvePath(scope.root, segs, scope);
    }
    if (t.StartsWith(".")) {
      const segs = t.Substring(1).Split(".");
      return TemplateRuntime.resolvePath(scope.dot, segs, scope);
    }
    if (t.StartsWith("$") && t.Length > 1) {
      const inner = t.Substring(1);
      const segs = inner.Split(".");
      const name = segs.Length > 0 ? segs[0]! : inner;
      const value = scope.getVar(name) ?? TemplateRuntime.nil;
      if (segs.Length > 1) {
        const rem = new List<string>();
        for (let i = 1; i < segs.Length; i++) rem.Add(segs[i]!);
        return TemplateRuntime.resolvePath(value, rem.ToArray(), scope);
      }
      return value;
    }
    if (t === "site") return new SiteValue(scope.site);
    if (t.StartsWith("site.")) {
      const segs = t.Substring(5).Split(".");
      return TemplateRuntime.resolvePath(new SiteValue(scope.site), segs, scope);
    }
    const lit = TemplateRuntime.parseStringLiteral(t);
    if (lit !== undefined) return new StringValue(lit);
    if (t === "true") return new BoolValue(true);
    if (t === "false") return new BoolValue(false);
    if (TemplateRuntime.isNumberLiteral(t)) return new NumberValue(Int32.Parse(t));
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
    const name = nameRaw.Trim().ToLowerInvariant();
    try {

    if (name === "site.store.get" && args.Length >= 1) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      return store.get(TemplateRuntime.toPlainString(args[0]!));
    }
    if (name === "site.store.set" && args.Length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.set(TemplateRuntime.toPlainString(args[0]!), args[1]!);
      return TemplateRuntime.nil;
    }
    if (name === "site.store.add" && args.Length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.add(TemplateRuntime.toPlainString(args[0]!), args[1]!);
      return TemplateRuntime.nil;
    }
    if (name === "site.store.delete" && args.Length >= 1) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.delete(TemplateRuntime.toPlainString(args[0]!));
      return TemplateRuntime.nil;
    }
    if (name === "site.store.setinmap" && args.Length >= 3) {
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
    if (name === "site.store.deleteinmap" && args.Length >= 2) {
      const store = TemplateRuntime.getSiteStore(scope.site);
      store.deleteInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!));
      return TemplateRuntime.nil;
    }

    const trimmedName = nameRaw.Trim();
    const lastDot = trimmedName.LastIndexOf(".");
    const lowerName = trimmedName.ToLowerInvariant();
    const startsWithDot = trimmedName.StartsWith(".");
    const startsWithDollar = trimmedName.StartsWith("$");
    const startsWithSite = lowerName.StartsWith("site.");

    let receiverToken: string | undefined = undefined;
    let methodName: string | undefined = undefined;
    if (lastDot > 0) {
      if (startsWithDot || startsWithDollar || startsWithSite) {
        receiverToken = trimmedName.Substring(0, lastDot);
        methodName = trimmedName.Substring(lastDot + 1).Trim();
      }
    } else if (startsWithDot && lastDot === 0) {
      receiverToken = ".";
      methodName = trimmedName.Substring(1).Trim();
    }

    if (receiverToken !== undefined && methodName !== undefined && methodName.Trim() !== "") {
      const method = methodName.ToLowerInvariant();
      const receiverValue = TemplateRuntime.evalToken(receiverToken, scope);

      if (receiverValue instanceof ScratchValue) {
        const scratch = receiverValue as ScratchValue;
        const store = scratch.value;
        if (method === "get" && args.Length >= 1) return store.get(TemplateRuntime.toPlainString(args[0]!));
        if (method === "set" && args.Length >= 2) {
          store.set(TemplateRuntime.toPlainString(args[0]!), args[1]!);
          return TemplateRuntime.nil;
        }
        if (method === "add" && args.Length >= 2) {
          store.add(TemplateRuntime.toPlainString(args[0]!), args[1]!);
          return TemplateRuntime.nil;
        }
        if (method === "delete" && args.Length >= 1) {
          store.delete(TemplateRuntime.toPlainString(args[0]!));
          return TemplateRuntime.nil;
        }
        if (method === "setinmap" && args.Length >= 3) {
          store.setInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!), args[2]!);
          return TemplateRuntime.nil;
        }
        if (method === "deleteinmap" && args.Length >= 2) {
          store.deleteInMap(TemplateRuntime.toPlainString(args[0]!), TemplateRuntime.toPlainString(args[1]!));
          return TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof PageResourcesValue) {
        const resources = receiverValue as PageResourcesValue;
        const mgr = resources.manager;
        const page = resources.page;

        if (method === "get" && args.Length >= 1) {
          if (page.File === undefined) return TemplateRuntime.nil;
          const raw = TemplateRuntime.toPlainString(args[0]!);
          const normalized = TemplateRuntime.normalizeRelPath(raw);
          if (normalized === "") return TemplateRuntime.nil;

          const pageDir = Path.GetDirectoryName(page.File.Filename);
          if (pageDir === undefined || pageDir.Trim() === "") return TemplateRuntime.nil;

          const pageDirFull = Path.GetFullPath(pageDir);
          const pagePrefix = pageDirFull.EndsWith(Path.DirectorySeparatorChar) ? pageDirFull : pageDirFull + Path.DirectorySeparatorChar;
          const slash: char = "/";
          const osRel = normalized.Replace(slash, Path.DirectorySeparatorChar);
          const candidate = Path.GetFullPath(Path.Combine(pageDirFull, osRel));
          if (!candidate.StartsWith(pagePrefix) || !File.Exists(candidate)) return TemplateRuntime.nil;

          const bytes = File.ReadAllBytes(candidate);
          const ext = (Path.GetExtension(candidate) ?? "").ToLowerInvariant();
          const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
          const text = isText ? Encoding.UTF8.GetString(bytes) : undefined;

          const base = TemplateRuntime.trimSlashes(page.relPermalink);
          const outRel = base === "" ? normalized : TemplateRuntime.trimEndChar(base, "/") + "/" + normalized;
          const id = `pageRes:${page.relPermalink}:${normalized}`;
          const res = new Resource(id, candidate, true, outRel, bytes, text, new ResourceData(""));
          return new ResourceValue(mgr, res);
        }

        if (method === "getmatch" && args.Length >= 1) {
          if (page.File === undefined) return TemplateRuntime.nil;
          const pattern = TemplateRuntime.toPlainString(args[0]!).Trim();
          if (pattern === "") return TemplateRuntime.nil;

          const pageDir = Path.GetDirectoryName(page.File.Filename);
          if (pageDir === undefined || pageDir.Trim() === "") return TemplateRuntime.nil;

          const files = Directory.GetFiles(pageDir, "*", SearchOption.AllDirectories);
          for (let i = 0; i < files.Length; i++) {
            const filePath = files[i]!;
            const rel = filePath.Length > 0 ? replaceText(Path.GetRelativePath(pageDir, filePath), "\\", "/") : "";
            if (rel === "" || !TemplateRuntime.globMatch(pattern, rel)) continue;

            const bytes = File.ReadAllBytes(filePath);
            const ext = (Path.GetExtension(filePath) ?? "").ToLowerInvariant();
            const isText = ext === ".js" || ext === ".json" || ext === ".css" || ext === ".svg" || ext === ".html" || ext === ".txt";
            const text = isText ? Encoding.UTF8.GetString(bytes) : undefined;

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
        if (method === "getpage" && args.Length >= 1) {
          const path = TemplateRuntime.toPlainString(args[0]!);
          const p = TemplateRuntime.tryGetPage(site, path);
          return p !== undefined ? new PageValue(p) : TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof PageValue) {
        const page = (receiverValue as PageValue).value;

        if (method === "renderstring" && args.Length >= 1) {
          const markdown = TemplateRuntime.toPlainString(args[0]!);
          // Use full markdown rendering with shortcodes and render hooks
          const result = renderMarkdownWithShortcodes(markdown, page, scope.site, env);
          return new HtmlValue(new HtmlString(result.html));
        }

        if (method === "getpage" && args.Length >= 1) {
          const raw = TemplateRuntime.toPlainString(args[0]!);
          const resolved = TemplateRuntime.resolvePageRef(page, raw);
          const found = TemplateRuntime.tryGetPage(page.site, resolved);
          return found !== undefined ? new PageValue(found) : TemplateRuntime.nil;
        }

        if (method === "isancestor" && args.Length >= 1) {
          const otherValue = args[0]!;
          if (otherValue instanceof PageValue) {
            const other = (otherValue as PageValue).value;
            const ancestors = other.ancestors;
            for (let i = 0; i < ancestors.Length; i++) {
              if (ancestors[i] === page) return new BoolValue(true);
            }
            const base = TemplateRuntime.trimEndChar(page.relPermalink, "/");
            const child = TemplateRuntime.trimEndChar(other.relPermalink, "/");
            return new BoolValue(child.StartsWith(base) && child !== base);
          }
          return new BoolValue(false);
        }

        if (method === "ismenucurrent" && args.Length >= 2) {
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
        if (method === "get" && args.Length >= 1) {
          const formatName = TemplateRuntime.toPlainString(args[0]!).ToLowerInvariant();
          const formats = site.getOutputFormats();
          for (let i = 0; i < formats.Length; i++) {
            const fmt = formats[i]!;
            if (fmt.Rel.ToLowerInvariant() === formatName || formatName === "rss") {
              return new OutputFormatValue(fmt);
            }
          }
          return TemplateRuntime.nil;
        }
      }

      if (receiverValue instanceof ShortcodeValue) {
        const sc = (receiverValue as ShortcodeValue).value;
        if (method === "get" && args.Length >= 1) {
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

        if ((method === "next" || method === "prev") && args.Length >= 1) {
          const target = args[0]!;
          if (target instanceof PageValue) {
            const targetPage = (target as PageValue).value;
            const arr = new List<TemplateValue>();
            const it = items.GetEnumerator();
            while (it.MoveNext()) arr.Add(it.Current);
            const vals = arr.ToArray();

            let idx: int = -1;
            for (let i = 0; i < vals.Length; i++) {
              const cur = vals[i]!;
              if (cur instanceof PageValue && (cur as PageValue).value === targetPage) {
                idx = i;
                break;
              }
            }
            if (idx < 0) return TemplateRuntime.nil;
            const nextIndex = method === "next" ? idx + 1 : idx - 1;
            if (nextIndex < 0 || nextIndex >= vals.Length) return TemplateRuntime.nil;
            return vals[nextIndex]!;
          }
        }
      }
    }

    if (name === "return") {
      const v = args.Length >= 1 ? args[0]! : TemplateRuntime.nil;
      throw new ReturnException(v);
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

    if (name === "i18n" && args.Length >= 1) {
      const key = TemplateRuntime.toPlainString(args[0]!);
      const lang = scope.site.Language.Lang;
      const translated = env.getI18n(lang, key);
      return new StringValue(translated);
    }

    if (name === "resources.get" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const path = TemplateRuntime.toPlainString(args[0]!);
      const res = mgr.get(path);
      return res !== undefined ? new ResourceValue(mgr, res) : TemplateRuntime.nil;
    }

    if (name === "resources.getmatch" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const res = mgr.getMatch(pattern);
      return res !== undefined ? new ResourceValue(mgr, res) : TemplateRuntime.nil;
    }

    // resources.Match - get all matching resources (returns array)
    if (name === "resources.match" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return new AnyArrayValue(new List<TemplateValue>());
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const resources = mgr.match(pattern);
      const result = new List<TemplateValue>();
      for (let i = 0; i < resources.Length; i++) {
        result.Add(new ResourceValue(mgr, resources[i]!));
      }
      return new AnyArrayValue(result);
    }

    // resources.ByType - get all resources of a given media type
    if (name === "resources.bytype" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return new AnyArrayValue(new List<TemplateValue>());
      const mediaType = TemplateRuntime.toPlainString(args[0]!);
      const resources = mgr.byType(mediaType);
      const result = new List<TemplateValue>();
      for (let i = 0; i < resources.Length; i++) {
        result.Add(new ResourceValue(mgr, resources[i]!));
      }
      return new AnyArrayValue(result);
    }

    // resources.Concat - concatenate resources into one
    if (name === "resources.concat" && args.Length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const targetPath = TemplateRuntime.toPlainString(args[0]!);
      const input = args[args.Length - 1]!;
      // Input can be an array of resources (piped from slice or Match)
      const resources = new List<Resource>();
      if (input instanceof AnyArrayValue) {
        const arr = input.value.ToArray();
        for (let i = 0; i < arr.Length; i++) {
          const item = arr[i]!;
          if (item instanceof ResourceValue) {
            resources.Add((item as ResourceValue).value);
          }
        }
      } else if (input instanceof ResourceValue) {
        resources.Add((input as ResourceValue).value);
      }
      if (resources.Count === 0) return TemplateRuntime.nil;
      const res = mgr.concat(targetPath, resources.ToArray());
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.fromstring" && args.Length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const content = TemplateRuntime.toPlainString(args[1]!);
      const res = mgr.fromString(nameArg, content);
      return new ResourceValue(mgr, res);
    }

	    if (name === "resources.executeastemplate" && args.Length >= 2) {
	      const mgr = TemplateRuntime.getResourceManager(env);
	      if (mgr === undefined) return TemplateRuntime.nil;
	      const piped = args.Length >= 3 ? args[args.Length - 1]! : TemplateRuntime.nil;
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
	      const rendered = sb.ToString();
      const bytes = Encoding.UTF8.GetBytes(rendered);
      const lang = scope.site.Language.Lang;
      const id = `${src.id}|executeAsTemplate:${targetName}|lang:${lang}`;
      const out = new Resource(id, src.sourcePath, src.publishable, targetName, bytes, rendered, new ResourceData(""));
      return new ResourceValue(mgr, out);
    }

    if (name === "resources.minify" || name === "minify") {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args.Length >= 1 ? args[args.Length - 1]! : TemplateRuntime.nil;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.minify(src);
      return new ResourceValue(mgr, res);
    }

    if ((name === "resources.fingerprint" || name === "fingerprint") && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.Length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.fingerprint(src);
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.copy" && args.Length >= 2) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const targetPath = TemplateRuntime.toPlainString(args[0]!);
      const piped = args[args.Length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.copy(targetPath, src);
      return new ResourceValue(mgr, res);
    }

    if (name === "resources.postprocess" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.Length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.postProcess(src);
      return new ResourceValue(mgr, res);
    }

    if ((name === "images.resize" || name === "resize") && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;

      // First arg is resize spec, piped resource is last arg
      const spec = args.Length >= 2 ? TemplateRuntime.toPlainString(args[0]!) : "";
      const piped = args[args.Length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.resize(src, spec);
      return new ResourceValue(mgr, res);
    }

    if (name === "css.sass" && args.Length >= 1) {
      const mgr = TemplateRuntime.getResourceManager(env);
      if (mgr === undefined) return TemplateRuntime.nil;
      const piped = args[args.Length - 1]!;
      const isResource = piped instanceof ResourceValue;
      if (isResource === false) return TemplateRuntime.nil;
      const src = (piped as ResourceValue).value;
      const res = mgr.sassCompile(src);
      return new ResourceValue(mgr, res);
    }

    if (name === "partial" && args.Length >= 1) {
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const ctx = args.Length >= 2 ? args[1]! : scope.dot;
      const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
      if (tpl === undefined) return TemplateRuntime.nil;

      const sb = new StringBuilder();
      const partialScope = new RenderScope(ctx, ctx, scope.site, scope.env, undefined);
      try {
        tpl.renderInto(sb, partialScope, env, overrides);
        return new HtmlValue(new HtmlString(sb.ToString()));
      } catch (e) {
        if (e instanceof ReturnException) return e.value;
        throw e;
      }
    }

    if (name === "partialcached" && args.Length >= 1) {
      const nameArg = TemplateRuntime.toPlainString(args[0]!);
      const ctx = args.Length >= 2 ? args[1]! : scope.dot;
      const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
      if (tpl === undefined) return TemplateRuntime.nil;

      const sb = new StringBuilder();
      const partialScope = new RenderScope(ctx, ctx, scope.site, scope.env, undefined);
      try {
        tpl.renderInto(sb, partialScope, env, overrides);
        return new HtmlValue(new HtmlString(sb.ToString()));
      } catch (e) {
        if (e instanceof ReturnException) return e.value;
        throw e;
      }
    }

    // templates.Exists - check if a template exists
    if (name === "templates.exists" && args.Length >= 1) {
      const templatePath = TemplateRuntime.toPlainString(args[0]!);
      const tpl = env.getTemplate(templatePath);
      return new BoolValue(tpl !== undefined);
    }

    // errorf - log error and continue (in Hugo this can halt, but we just warn)
    if (name === "errorf" && args.Length >= 1) {
      const format = TemplateRuntime.toPlainString(args[0]!);
      let message = format;
      // Simple %s replacement for additional args
      for (let i = 1; i < args.Length; i++) {
        message = message.Replace("%s", TemplateRuntime.toPlainString(args[i]!));
        message = message.Replace("%v", TemplateRuntime.toPlainString(args[i]!));
        message = message.Replace("%d", TemplateRuntime.toPlainString(args[i]!));
      }
      Console.Error.WriteLine("ERROR: {0}", message);
      return TemplateRuntime.nil;
    }

    // warnf - log warning and continue
    if (name === "warnf" && args.Length >= 1) {
      const format = TemplateRuntime.toPlainString(args[0]!);
      let message = format;
      for (let i = 1; i < args.Length; i++) {
        message = message.Replace("%s", TemplateRuntime.toPlainString(args[i]!));
        message = message.Replace("%v", TemplateRuntime.toPlainString(args[i]!));
        message = message.Replace("%d", TemplateRuntime.toPlainString(args[i]!));
      }
      Console.Error.WriteLine("WARN: {0}", message);
      return TemplateRuntime.nil;
    }

    if (name === "safehtml" && args.Length >= 1) {
      const v = args[0]!;
      if (v instanceof HtmlValue) return v;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safehtmlattr" && args.Length >= 1) {
      const v = args[0]!;
      if (v instanceof HtmlValue) return v;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safejs" && args.Length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "safeurl" && args.Length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(escapeHtml(TemplateRuntime.toPlainString(v))));
    }

    if (name === "safecss" && args.Length >= 1) {
      const v = args[0]!;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "htmlescape" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(escapeHtml(TemplateRuntime.toPlainString(v)));
    }

    if (name === "htmlunescape" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(WebUtility.HtmlDecode(TemplateRuntime.toPlainString(v)) ?? "");
    }

    if (name === "time.format" && args.Length >= 2) {
      const layout = TemplateRuntime.toPlainString(args[0]!);
      const input = TemplateRuntime.toPlainString(args[1]!);
      let parsed: DateTime = DateTime.MinValue;
      const ok = DateTime.TryParse(input, parsed);
      if (!ok) return new StringValue("");
      const fmt = TemplateRuntime.convertGoDateLayoutToDotNet(layout);
      return new StringValue(parsed.ToString(fmt));
    }

	    if (name === "path.base" && args.Length >= 1) {
	      const raw = TemplateRuntime.toPlainString(args[0]!);
	      const normalized = TemplateRuntime.trimEndChar(replaceText(raw, "\\", "/"), "/");
	      if (normalized === "") return new StringValue("");
	      const idx = normalized.LastIndexOf("/");
	      return idx >= 0 ? new StringValue(normalized.Substring(idx + 1)) : new StringValue(normalized);
	    }

    if (name === "title" && args.Length >= 1) {
      return new StringValue(TemplateRuntime.toTitleCase(TemplateRuntime.toPlainString(args[0]!)));
    }

    if (name === "where" && args.Length >= 4) {
      const pages = TemplateRuntime.toPages(args[0]!);
      const path = TemplateRuntime.toPlainString(args[1]!);
      const opRaw = TemplateRuntime.toPlainString(args[2]!).ToLowerInvariant();
      const expected = args[3]!;
      const empty: string[] = [];
      const segs = path.Trim() === "" ? empty : path.Split(".");
      const out = new List<PageContext>();
      for (let i = 0; i < pages.Length; i++) {
        const page = pages[i]!;
        const actual = segs.Length === 0 ? new PageValue(page) : TemplateRuntime.resolvePath(new PageValue(page), segs, scope);
        const ok = TemplateRuntime.matchWhere(actual, opRaw, expected);
        if (ok) out.Add(page);
      }
      return new PageArrayValue(out.ToArray());
    }

    if (name === "sort" && args.Length >= 1) {
      const collection = args[0]!;
      const sortKey = args.Length >= 2 ? TemplateRuntime.toPlainString(args[1]!) : "";
      const sortOrder = args.Length >= 3 ? TemplateRuntime.toPlainString(args[2]!).ToLowerInvariant() : "asc";
      const isDesc = sortOrder === "desc";
      const empty: string[] = [];
      const keySegs = sortKey.Trim() === "" ? empty : sortKey.Split(".");

      if (collection instanceof PageArrayValue) {
        const arr = TemplateRuntime.copyPageArray(collection.value);
        // Simple bubble sort
        for (let i = 0; i < arr.Length; i++) {
          for (let j = i + 1; j < arr.Length; j++) {
            const aVal = keySegs.Length === 0 ? new PageValue(arr[i]!) : TemplateRuntime.resolvePath(new PageValue(arr[i]!), keySegs, scope);
            const bVal = keySegs.Length === 0 ? new PageValue(arr[j]!) : TemplateRuntime.resolvePath(new PageValue(arr[j]!), keySegs, scope);
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
        const items = collection.value.ToArray();
        const sorted = new List<TemplateValue>();
        for (let i = 0; i < items.Length; i++) sorted.Add(items[i]!);
        const arr = sorted.ToArray();
        for (let i = 0; i < arr.Length; i++) {
          for (let j = i + 1; j < arr.Length; j++) {
            const aVal = keySegs.Length === 0 ? arr[i]! : TemplateRuntime.resolvePath(arr[i]!, keySegs, scope);
            const bVal = keySegs.Length === 0 ? arr[j]! : TemplateRuntime.resolvePath(arr[j]!, keySegs, scope);
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
        for (let i = 0; i < arr.Length; i++) sortResult.Add(arr[i]!);
        return new AnyArrayValue(sortResult);
      }

      return collection;
    }

    if (name === "after" && args.Length >= 2) {
      const n = TemplateRuntime.toNumber(args[0]!);
      const collection = args[1]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const result = new List<PageContext>();
        for (let i = n; i < pages.Length; i++) result.Add(pages[i]!);
        return new PageArrayValue(result.ToArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.ToArray();
        const result = new List<TemplateValue>();
        for (let i = n; i < items.Length; i++) result.Add(items[i]!);
        return new AnyArrayValue(result);
      }

      return TemplateRuntime.nil;
    }

    if (name === "last" && args.Length >= 2) {
      const n = TemplateRuntime.toNumber(args[0]!);
      const collection = args[1]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const start: int = pages.Length > n ? pages.Length - n : 0;
        const result = new List<PageContext>();
        for (let i = start; i < pages.Length; i++) result.Add(pages[i]!);
        return new PageArrayValue(result.ToArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.ToArray();
        const start: int = items.Length > n ? items.Length - n : 0;
        const result = new List<TemplateValue>();
        for (let i = start; i < items.Length; i++) result.Add(items[i]!);
        return new AnyArrayValue(result);
      }

      return TemplateRuntime.nil;
    }

    if (name === "uniq" && args.Length >= 1) {
      const collection = args[0]!;

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const seen = new Dictionary<string, boolean>();
        const uniqResult = new List<PageContext>();
        for (let i = 0; i < pages.Length; i++) {
          const p = pages[i]!;
          const key = p.relPermalink;
          let exists = false;
          const found = seen.TryGetValue(key, exists);
          if (found === false) {
            seen.Add(key, true);
            uniqResult.Add(p);
          }
        }
        return new PageArrayValue(uniqResult.ToArray());
      }

      if (collection instanceof AnyArrayValue) {
        const items = collection.value.ToArray();
        const seen = new Dictionary<string, boolean>();
        const uniqResult = new List<TemplateValue>();
        for (let i = 0; i < items.Length; i++) {
          const key = TemplateRuntime.toPlainString(items[i]!);
          let exists = false;
          const found = seen.TryGetValue(key, exists);
          if (found === false) {
            seen.Add(key, true);
            uniqResult.Add(items[i]!);
          }
        }
        return new AnyArrayValue(uniqResult);
      }

      return collection;
    }

    if (name === "group" && args.Length >= 2) {
      const key = TemplateRuntime.toPlainString(args[0]!);
      const collection = args[1]!;
      const empty: string[] = [];
      const keySegs = key.Trim() === "" ? empty : key.Split(".");

      if (collection instanceof PageArrayValue) {
        const pages = TemplateRuntime.copyPageArray(collection.value);
        const groups = new Dictionary<string, List<PageContext>>();
        const groupOrder = new List<string>();

        for (let i = 0; i < pages.Length; i++) {
          const page = pages[i]!;
          const val = TemplateRuntime.resolvePath(new PageValue(page), keySegs, scope);
          const groupKey = TemplateRuntime.toPlainString(val);

          let group: List<PageContext> = new List<PageContext>();
          const hasGroup = groups.TryGetValue(groupKey, group);
          if (hasGroup === false) {
            group = new List<PageContext>();
            groups.Add(groupKey, group);
            groupOrder.Add(groupKey);
          }
          group.Add(page);
        }

        const groupResult = new List<TemplateValue>();
        const keys = groupOrder.ToArray();
        for (let i = 0; i < keys.Length; i++) {
          let group: List<PageContext> = new List<PageContext>();
          groups.TryGetValue(keys[i]!, group);
          const groupDict = new Dictionary<string, TemplateValue>();
          groupDict.Add("Key", new StringValue(keys[i]!));
          groupDict.Add("Pages", new PageArrayValue(group.ToArray()));
          groupResult.Add(new DictValue(groupDict));
        }
        return new AnyArrayValue(groupResult);
      }

      return TemplateRuntime.nil;
    }

    if (name === "plainify" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      // very small tag stripper (best-effort)
      const sb = new StringBuilder();
      let inTag = false;
      for (let i = 0; i < s.Length; i++) {
        const ch = s.Substring(i, 1);
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

    if (name === "cond" && args.Length >= 3) {
      return TemplateRuntime.isTruthy(args[0]!) ? args[1]! : args[2]!;
    }

    if (name === "dict") {
      const map = new Dictionary<string, TemplateValue>();
      for (let i = 0; i + 1 < args.Length; i += 2) {
        const k = TemplateRuntime.toPlainString(args[i]!);
        map.Remove(k);
        map.Add(k, args[i + 1]!);
      }
      return new DictValue(map);
    }

    if (name === "slice") {
      const items = new List<TemplateValue>();
      for (let i = 0; i < args.Length; i++) items.Add(args[i]!);
      return new AnyArrayValue(items);
    }

    if (name === "append" && args.Length >= 2) {
      const listValue = args[args.Length - 1]!;
      const items = new List<TemplateValue>();
      if (listValue instanceof AnyArrayValue) {
        const it = listValue.value.GetEnumerator();
        while (it.MoveNext()) items.Add(it.Current);
      } else {
        items.Add(listValue);
      }

      for (let i = 0; i < args.Length - 1; i++) {
        const v = args[i]!;
        if (v instanceof AnyArrayValue) {
          const it = v.value.GetEnumerator();
          while (it.MoveNext()) items.Add(it.Current);
        } else {
          items.Add(v);
        }
      }
      return new AnyArrayValue(items);
    }

    if (name === "merge" && args.Length >= 2) {
      const a = args[0]!;
      const b = args[1]!;
      const merged = new Dictionary<string, TemplateValue>();
      if (a instanceof DictValue) {
        const it = a.value.GetEnumerator();
        while (it.MoveNext()) {
          const kv = it.Current;
          merged.Remove(kv.Key);
          merged.Add(kv.Key, kv.Value);
        }
      }
      if (b instanceof DictValue) {
        const it = b.value.GetEnumerator();
        while (it.MoveNext()) {
          const kv = it.Current;
          merged.Remove(kv.Key);
          merged.Add(kv.Key, kv.Value);
        }
      }
      return new DictValue(merged);
    }

    if (name === "isset" && args.Length >= 2) {
      const container = args[0]!;
      const key = TemplateRuntime.toPlainString(args[1]!);
      if (container instanceof DictValue) {
        let v: TemplateValue = TemplateRuntime.nil;
        return new BoolValue(container.value.TryGetValue(key, v));
      }
      return new BoolValue(false);
    }

    if (name === "index" && args.Length >= 2) {
      const container = args[0]!;
      const keyValue = args[1]!;
      if (container instanceof DictValue) {
        const key = TemplateRuntime.toPlainString(keyValue);
        let v: TemplateValue = TemplateRuntime.nil;
        return container.value.TryGetValue(key, v) ? v : TemplateRuntime.nil;
      }
      if (container instanceof AnyArrayValue) {
        if (keyValue instanceof NumberValue) {
          const idx = (keyValue as NumberValue).value;
          if (idx < 0 || idx >= container.value.Count) return TemplateRuntime.nil;
          const it = container.value.GetEnumerator();
          let pos: int = 0;
          while (it.MoveNext()) {
            if (pos === idx) return it.Current;
            pos++;
          }
          return TemplateRuntime.nil;
        }
      }
      if (container instanceof PageArrayValue) {
        if (keyValue instanceof NumberValue) {
          const idx = (keyValue as NumberValue).value;
          return idx >= 0 && idx < container.value.Length ? new PageValue(container.value[idx]!) : TemplateRuntime.nil;
        }
      }
      return TemplateRuntime.nil;
    }

    if (name === "delimit" && args.Length >= 2) {
      const listValue = args[0]!;
      const delim = TemplateRuntime.toPlainString(args[1]!);
      const parts = new List<string>();
      if (listValue instanceof AnyArrayValue) {
        const it = listValue.value.GetEnumerator();
        while (it.MoveNext()) parts.Add(TemplateRuntime.toPlainString(it.Current));
      } else if (listValue instanceof StringArrayValue) {
        for (let i = 0; i < listValue.value.Length; i++) parts.Add(listValue.value[i]!);
      }
      const arr = parts.ToArray();
      let out = "";
      for (let i = 0; i < arr.Length; i++) {
        if (i > 0) out += delim;
        out += arr[i]!;
      }
      return new StringValue(out);
    }

    if (name === "in" && args.Length >= 2) {
      const container = args[0]!;
      const needle = TemplateRuntime.toPlainString(args[1]!);
      if (container instanceof AnyArrayValue) {
        const it = container.value.GetEnumerator();
        while (it.MoveNext()) {
          if (TemplateRuntime.toPlainString(it.Current) === needle) return new BoolValue(true);
        }
        return new BoolValue(false);
      }
      if (container instanceof StringValue) {
        return new BoolValue(container.value.Contains(needle));
      }
      return new BoolValue(false);
    }

	    if (name === "split" && args.Length >= 2) {
	      const s = TemplateRuntime.toPlainString(args[0]!);
	      const delim = TemplateRuntime.toPlainString(args[1]!);
	      const items = new List<TemplateValue>();
	      if (delim === "") {
	        for (let i = 0; i < s.Length; i++) items.Add(new StringValue(s.Substring(i, i + 1)));
	        return new AnyArrayValue(items);
	      }
	
	      let start = 0;
	      while (true) {
	        const idx = s.IndexOf(delim, start);
	        if (idx < 0) break;
	        items.Add(new StringValue(s.Substring(start, idx)));
	        start = idx + delim.Length;
	      }
	      items.Add(new StringValue(s.Substring(start)));
	      return new AnyArrayValue(items);
	    }

    if (name === "add" && args.Length >= 2) {
      let sum: int = 0;
      for (let i = 0; i < args.Length; i++) {
        const v = args[i]!;
        let parsed: int = 0;
        const s = TemplateRuntime.toPlainString(v);
        if (Int32.TryParse(s, parsed)) sum += parsed;
      }
      return new NumberValue(sum);
    }

    if (name === "sub" && args.Length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      return new NumberValue(a - b);
    }

    if (name === "mul" && args.Length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      return new NumberValue(a * b);
    }

    if (name === "div" && args.Length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      if (b === 0) return new NumberValue(0);
      return new NumberValue(a / b);
    }

    if (name === "mod" && args.Length >= 2) {
      const a = TemplateRuntime.toNumber(args[0]!);
      const b = TemplateRuntime.toNumber(args[1]!);
      if (b === 0) return new NumberValue(0);
      return new NumberValue(a % b);
    }

    if (name === "newscratch") {
      return new ScratchValue(new ScratchStore());
    }

    if (name === "encoding.jsonify" || name === "jsonify") {
      const v = args.Length >= 1 ? args[0]! : TemplateRuntime.nil;
      return new StringValue(TemplateRuntime.toJson(v));
    }

    if (name === "crypto.sha1" && args.Length >= 1) {
      const bytes = Encoding.UTF8.GetBytes(TemplateRuntime.toPlainString(args[0]!));
      const hash = SHA1.HashData(bytes);
      return new StringValue(TemplateRuntime.bytesToHex(hash));
    }

    if (name === "md5" && args.Length >= 1) {
      const bytes = Encoding.UTF8.GetBytes(TemplateRuntime.toPlainString(args[0]!));
      const hash = MD5.HashData(bytes);
      return new StringValue(TemplateRuntime.bytesToHex(hash));
    }

    if (name === "urls.parse" && args.Length >= 1) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      return new UrlValue(TemplateRuntime.parseUrl(s));
    }

    if (name === "urls.joinpath" && args.Length >= 1) {
      const parts = new List<string>();
      for (let i = 0; i < args.Length; i++) parts.Add(TemplateRuntime.toPlainString(args[i]!));
      const arr = parts.ToArray();
      let out = "";
      for (let i = 0; i < arr.Length; i++) {
        const p = arr[i]!;
        out = out === "" ? TemplateRuntime.trimSlashes(p) : TemplateRuntime.trimEndChar(out, "/") + "/" + TemplateRuntime.trimStartChar(p, "/");
      }
      return new StringValue(out);
    }

    if (name === "strings.Contains" && args.Length >= 2) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const sub = TemplateRuntime.toPlainString(args[1]!);
      return new BoolValue(s.Contains(sub));
    }

    if (name === "strings.hasprefix" && args.Length >= 2) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const prefix = TemplateRuntime.toPlainString(args[1]!);
      return new BoolValue(s.StartsWith(prefix));
    }

    if (name === "strings.trimprefix" && args.Length >= 2) {
      const prefix = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      return new StringValue(s.StartsWith(prefix) ? s.Substring(prefix.Length) : s);
    }

    if (name === "strings.trimsuffix" && args.Length >= 2) {
      const suffix = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      return new StringValue(s.EndsWith(suffix) ? s.Substring(0, s.Length - suffix.Length) : s);
    }

    if (name === "warnf") return TemplateRuntime.nil;
    if (name === "errorf") {
      const msg = TemplateRuntime.toPlainString(args.Length >= 1 ? args[0]! : TemplateRuntime.nil);
      throw new Exception(msg);
    }

    if (name === "urlize" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(slugify(TemplateRuntime.toPlainString(v)));
    }

    if (name === "humanize" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(humanizeSlug(TemplateRuntime.toPlainString(v)));
    }

    if (name === "lower" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).ToLowerInvariant());
    }

    if (name === "upper" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).ToUpperInvariant());
    }

    if (name === "trim" && args.Length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).Trim());
    }

    if (name === "replace" && args.Length >= 3) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const oldStr = TemplateRuntime.toPlainString(args[1]!);
      const newStr = TemplateRuntime.toPlainString(args[2]!);
      return new StringValue(s.Replace(oldStr, newStr));
    }

    if (name === "replaceRE" && args.Length >= 3) {
      const pattern = TemplateRuntime.toPlainString(args[0]!);
      const replacement = TemplateRuntime.toPlainString(args[1]!);
      const s = TemplateRuntime.toPlainString(args[2]!);
      const regex = new Regex(pattern);
      return new StringValue(regex.Replace(s, replacement));
    }

    if (name === "truncate" && args.Length >= 2) {
      const length = TemplateRuntime.toNumber(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      const ellipsis = args.Length >= 3 ? TemplateRuntime.toPlainString(args[2]!) : "...";
      if (s.Length <= length) return new StringValue(s);
      const truncLen: int = length - ellipsis.Length;
      if (truncLen <= 0) return new StringValue(ellipsis.Substring(0, length));
      return new StringValue(s.Substring(0, truncLen) + ellipsis);
    }

    if (name === "markdownify" && args.Length >= 1) {
      const s = TemplateRuntime.toPlainString(args[0]!);
      const md = renderMarkdown(s);
      // Strip wrapping <p> tags for inline use
      let html = md.html.Trim();
      if (html.StartsWith("<p>") && html.EndsWith("</p>")) {
        html = html.Substring(3, html.Length - 4);
      }
      return new HtmlValue(new HtmlString(html));
    }

    if (name === "relurl" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      return new StringValue(s.StartsWith("/") ? s : "/" + s);
    }

    if (name === "absurl" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const rel = s.StartsWith("/") ? s.Substring(1) : s;
      return new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
    }

    if (name === "abslangurl" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const lang = scope.site.Language.Lang;
      const langPrefix = scope.site.Languages.Length > 1 ? lang + "/" : "";
      const rel = s.StartsWith("/") ? s.Substring(1) : s;
      return new StringValue(ensureTrailingSlash(scope.site.baseURL) + langPrefix + rel);
    }

    if (name === "rellangurl" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const lang = scope.site.Language.Lang;
      const langPrefix = scope.site.Languages.Length > 1 ? "/" + lang : "";
      const path = s.StartsWith("/") ? s : "/" + s;
      return new StringValue(langPrefix + path);
    }

    if (name === "urlquery" && args.Length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      return new StringValue(Uri.EscapeDataString(s));
    }

    if (name === "default" && args.Length >= 2) {
      const fallback = args[0]!;
      const v = args[1]!;
      return TemplateRuntime.isTruthy(v) ? v : fallback;
    }

    if (name === "len" && args.Length >= 1) {
      const v = args[0]!;
      if (v instanceof StringValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof HtmlValue) {
        const l: int = v.value.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof PageArrayValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof StringArrayValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof SitesArrayValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof DocsMountArrayValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof NavArrayValue) {
        const l: int = v.value.Length;
        return new NumberValue(l);
      }
      if (v instanceof DictValue) {
        return new NumberValue(v.value.Count);
      }
      if (v instanceof AnyArrayValue) {
        return new NumberValue(v.value.Count);
      }
      return new NumberValue(0);
    }

    if (name === "dateformat" && args.Length >= 2) {
      const layout = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      let parsed: DateTime = DateTime.MinValue;
      const ok = DateTime.TryParse(s, parsed);
      if (!ok) return new StringValue("");
      const fmt = TemplateRuntime.convertGoDateLayoutToDotNet(layout);
      return new StringValue(parsed.ToString(fmt));
    }

    if (name === "print" && args.Length >= 1) {
      const sb = new StringBuilder();
      for (let i = 0; i < args.Length; i++) sb.Append(TemplateRuntime.toPlainString(args[i]!));
      return new StringValue(sb.ToString());
    }

    if (name === "printf" && args.Length >= 1) {
      const fmt = TemplateRuntime.toPlainString(args[0]!);
      const vals = new List<string>();
      for (let argIndex = 1; argIndex < args.Length; argIndex++) vals.Add(TemplateRuntime.toPlainString(args[argIndex]!));
      const values = vals.ToArray();

      const sb = new StringBuilder();
      let pos = 0;
      let valueIndex = 0;
      while (pos < fmt.Length) {
        const ch = fmt.Substring(pos, 1);
        if (ch === "%" && pos + 1 < fmt.Length) {
          const next = fmt.Substring(pos + 1, 1);
          if (next === "%") {
            sb.Append("%");
            pos += 2;
            continue;
          }
          if (next === "s") {
            if (valueIndex < values.Length) sb.Append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
          if (next === "d") {
            if (valueIndex < values.Length) sb.Append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
        }
        sb.Append(ch);
        pos++;
      }

      return new StringValue(sb.ToString());
    }

    if (args.Length >= 2) {
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
            cmp = av.CompareTo(bv);
          }
        } else {
          const av = TemplateRuntime.toPlainString(a);
          const bv = TemplateRuntime.toPlainString(b);
          cmp = av.CompareTo(bv);
        }

        if (name === "eq") return new BoolValue(cmp === 0);
        if (name === "ne") return new BoolValue(cmp !== 0);
        if (name === "lt") return new BoolValue(cmp < 0);
        if (name === "le") return new BoolValue(cmp <= 0);
        if (name === "gt") return new BoolValue(cmp > 0);
        return new BoolValue(cmp >= 0);
      }
    }

    if (name === "not" && args.Length >= 1) {
      return new BoolValue(!TemplateRuntime.isTruthy(args[0]!));
    }

    if (name === "and" && args.Length >= 1) {
      let cur = args[0]!;
      for (let i = 0; i < args.Length; i++) {
        cur = args[i]!;
        if (!TemplateRuntime.isTruthy(cur)) return cur;
      }
      return cur;
    }

    if (name === "or" && args.Length >= 1) {
      for (let i = 0; i < args.Length; i++) {
        const cur = args[i]!;
        if (TemplateRuntime.isTruthy(cur)) return cur;
      }
      return args[args.Length - 1]!;
    }

    return TemplateRuntime.nil;
    } catch (e) {
      if (e instanceof ReturnException) throw e;
      Console.Error.WriteLine("Template function failed: {0} ({1})", nameRaw, name);
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
    const method = methodName.ToLowerInvariant();

    // Handle AnyArrayValue methods (resource collections, page collections, etc.)
    if (receiver instanceof AnyArrayValue) {
      const arr = receiver.value;

      // GetMatch - find first item matching pattern (for resources)
      if (method === "getmatch" && args.Length >= 1) {
        const pattern = TemplateRuntime.toPlainString(args[0]!);
        const items = arr.ToArray();
        for (let i = 0; i < items.Length; i++) {
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
      if (method === "match" && args.Length >= 1) {
        const pattern = TemplateRuntime.toPlainString(args[0]!);
        const matchResult = new List<TemplateValue>();
        const items = arr.ToArray();
        for (let i = 0; i < items.Length; i++) {
          const item = items[i]!;
          if (item instanceof ResourceValue) {
            const res = item.value;
            const name = res.outputRelPath ?? res.id;
            if (TemplateRuntime.globMatch(pattern, name)) {
              matchResult.Add(item);
            }
          }
        }
        return new AnyArrayValue(matchResult);
      }

      // ByType - filter by media type (using path extension as heuristic)
      if (method === "bytype" && args.Length >= 1) {
        const targetType = TemplateRuntime.toPlainString(args[0]!).ToLowerInvariant();
        const byTypeResult = new List<TemplateValue>();
        const byTypeItems = arr.ToArray();
        for (let i = 0; i < byTypeItems.Length; i++) {
          const item = byTypeItems[i]!;
          if (item instanceof ResourceValue) {
            const res = item.value;
            // Determine type from extension
            const path = res.outputRelPath ?? res.id;
            const ext = TemplateRuntime.getPathExtension(path).ToLowerInvariant();
            let mainType = "application";
            if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp" || ext === ".svg") {
              mainType = "image";
            } else if (ext === ".css" || ext === ".html" || ext === ".js" || ext === ".json" || ext === ".xml" || ext === ".txt") {
              mainType = "text";
            }
            if (mainType === targetType) byTypeResult.Add(item);
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
      if (method === "first" && args.Length >= 1) {
        const n = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
        const firstResult = new List<PageContext>();
        for (let i = 0; i < pages.Length && i < n; i++) firstResult.Add(pages[i]!);
        return new PageArrayValue(firstResult.ToArray());
      }

      // Limit - same as First
      if (method === "limit" && args.Length >= 1) {
        const n = args[0] instanceof NumberValue ? (args[0] as NumberValue).value : 0;
        const limitResult = new List<PageContext>();
        for (let i = 0; i < pages.Length && i < n; i++) limitResult.Add(pages[i]!);
        return new PageArrayValue(limitResult.ToArray());
      }
    }

    // Handle PageValue methods
    if (receiver instanceof PageValue) {
      const page = receiver.value;

      // GetTerms - return term pages for a taxonomy
      if (method === "getterms" && args.Length >= 1) {
        const taxonomy = TemplateRuntime.toPlainString(args[0]!).ToLowerInvariant();
        const site = page.site;
        const termsResult = new List<PageContext>();

        // Get the term values from the page (e.g., tags, categories)
        // Currently only supports built-in tags and categories
        if (taxonomy !== "tags" && taxonomy !== "categories") {
          // Unsupported taxonomy - return empty result
          return new PageArrayValue(termsResult.ToArray());
        }
        let termValues: string[];
        if (taxonomy === "tags") {
          termValues = TemplateRuntime.copyStringArray(page.tags);
        } else {
          termValues = TemplateRuntime.copyStringArray(page.categories);
        }
        const allPages = TemplateRuntime.copyPageArray(site.allPages);

        // Find the term pages from site taxonomies
        for (let i = 0; i < termValues.Length; i++) {
          const termValue = termValues[i]!;
          // Look for the term page in site.allPages
          const termSlug = termValue.ToLowerInvariant().Replace(" ", "-");
          for (let j = 0; j < allPages.Length; j++) {
            const p = allPages[j]!;
            if (p.kind === "term" && p.section === taxonomy && p.slug === termSlug) {
              termsResult.Add(p);
              break;
            }
          }
        }

        return new PageArrayValue(termsResult.ToArray());
      }
    }

    // Handle ResourceValue methods
    if (receiver instanceof ResourceValue) {
      // Resize for images
      if (method === "resize" && args.Length >= 1) {
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
    const lastDot = path.LastIndexOf(".");
    if (lastDot < 0) return "";
    return path.Substring(lastDot);
  }

  static toJson(value: TemplateValue): string {
    if (value instanceof NilValue) return "null";
    if (value instanceof BoolValue) return value.value ? "true" : "false";
    if (value instanceof NumberValue) return value.value.ToString();
    if (value instanceof StringValue) return TemplateRuntime.toJsonString(value.value);
    if (value instanceof HtmlValue) return TemplateRuntime.toJsonString(value.value.value);
    if (value instanceof AnyArrayValue) {
      const items = value.value;
      const sb = new StringBuilder();
      sb.Append("[");
      let first = true;
      const it = items.GetEnumerator();
      while (it.MoveNext()) {
        if (!first) sb.Append(",");
        first = false;
        sb.Append(TemplateRuntime.toJson(it.Current));
      }
      sb.Append("]");
      return sb.ToString();
    }
    if (value instanceof DictValue) {
      const sb = new StringBuilder();
      sb.Append("{");
      let first = true;
      const it = value.value.GetEnumerator();
      while (it.MoveNext()) {
        const kv = it.Current;
        if (!first) sb.Append(",");
        first = false;
        sb.Append(TemplateRuntime.toJsonString(kv.Key));
        sb.Append(":");
        sb.Append(TemplateRuntime.toJson(kv.Value));
      }
      sb.Append("}");
      return sb.ToString();
    }
    return "null";
  }

  static toJsonString(value: string): string {
    const sb = new StringBuilder();
    sb.Append("\"");
    for (let i = 0; i < value.Length; i++) {
      const ch = value.Substring(i, 1);
      if (ch === "\\") sb.Append("\\\\");
      else if (ch === "\"") sb.Append("\\\"");
      else if (ch === "\n") sb.Append("\\n");
      else if (ch === "\r") sb.Append("\\r");
      else if (ch === "\t") sb.Append("\\t");
      else sb.Append(ch);
    }
    sb.Append("\"");
    return sb.ToString();
  }

  static bytesToHex(bytes: byte[]): string {
    const hexChars = "0123456789abcdef";
    const sb = new StringBuilder();
    for (let i = 0; i < bytes.Length; i++) {
      const b: int = bytes[i]!;
      sb.Append(hexChars.Substring((b >> 4) & 0xf, 1));
      sb.Append(hexChars.Substring(b & 0xf, 1));
    }
    return sb.ToString();
  }

  static parseUrl(value: string): Uri {
    const trimmed = value.Trim();
    try {
      return new Uri(trimmed, UriKind.RelativeOrAbsolute);
    } catch (e) {
      return new Uri("about:blank", UriKind.Absolute);
    }
  }

  static trimStartChar(value: string, ch: string): string {
    let start = 0;
    while (start < value.Length && value.Substring(start, 1) === ch) start++;
    return value.Substring(start);
  }

  static trimEndChar(value: string, ch: string): string {
    let end = value.Length;
    while (end > 0 && value.Substring(end - 1, 1) === ch) end--;
    return value.Substring(0, end);
  }

  static trimSlashes(value: string): string {
    const withoutLeading = TemplateRuntime.trimStartChar(value, "/");
    return TemplateRuntime.trimEndChar(withoutLeading, "/");
  }

  static trimRightWhitespace(s: string): string {
    return s.TrimEnd();
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

    while (i < template.Length) {
      const start = indexOfTextFrom(template, "{{", i);
      if (start < 0) {
        const textSegment = new Segment(false, template.Substring(i));
        segs.Add(textSegment);
        lastSegment = textSegment;
        break;
      }

      if (start > i) {
        const textSegment = new Segment(false, template.Substring(i, start - i));
        segs.Add(textSegment);
        lastSegment = textSegment;
      }

      const end = indexOfTextFrom(template, "}}", start + 2);
      if (end < 0) {
        const textSegment = new Segment(false, template.Substring(start));
        segs.Add(textSegment);
        lastSegment = textSegment;
        break;
      }

      let action = template.Substring(start + 2, end - (start + 2));
      let leftTrim = false;
      let rightTrim = false;

      if (action.StartsWith("-")) {
        leftTrim = true;
        action = action.Substring(1);
      }

      if (action.EndsWith("-")) {
        rightTrim = true;
        action = action.Substring(0, action.Length - 1);
      }

      action = action.Trim();

      if (leftTrim && lastSegment !== undefined && !lastSegment.isAction) {
        segs.RemoveAt(segs.Count - 1);
        const trimmedTextSegment = new Segment(false, TemplateRuntime.trimRightWhitespace(lastSegment.text));
        segs.Add(trimmedTextSegment);
        lastSegment = trimmedTextSegment;
      }

      const actionSegment = new Segment(true, action);
      segs.Add(actionSegment);
      lastSegment = actionSegment;
      i = end + 2;

      if (rightTrim) {
        while (i < template.Length) {
          const ch = template.Substring(i, 1);
          if (ch !== " " && ch !== "\t" && ch !== "\r" && ch !== "\n") break;
          i++;
        }
      }
    }

    return segs.ToArray();
  }

  static tokenizeAction(action: string): string[] {
    const tokens = new List<string>();
    let i = 0;

    const push = (t: string): void => {
      if (t !== "") tokens.Add(t);
    };

    while (i < action.Length) {
      const ch = action.Substring(i, 1);
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        i++;
        continue;
      }
      if (ch === "|") {
        tokens.Add("|");
        i++;
        continue;
      }
      if (ch === "(" || ch === ")" || ch === ",") {
        tokens.Add(ch);
        i++;
        continue;
      }
      if (ch === ":" && i + 1 < action.Length && action.Substring(i + 1, 1) === "=") {
        tokens.Add(":=");
        i += 2;
        continue;
      }
      if (ch === "=") {
        tokens.Add("=");
        i++;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        const quote = ch;
        i++;
        const quotedStart = i;
        while (i < action.Length && action.Substring(i, 1) !== quote) i++;
        const value = action.Substring(quotedStart, i - quotedStart);
        push(quote + value + quote);
        if (i < action.Length) i++;
        continue;
      }
      if (ch === "`") {
        const quote = ch;
        i++;
        const quotedStart = i;
        while (i < action.Length && action.Substring(i, 1) !== quote) i++;
        const value = action.Substring(quotedStart, i - quotedStart);
        push(quote + value + quote);
        if (i < action.Length) i++;
        continue;
      }

      const tokenStart = i;
      while (i < action.Length) {
        const c = action.Substring(i, 1);
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "|" || c === "(" || c === ")" || c === "," || c === "=") break;
        if (c === ":" && i + 1 < action.Length && action.Substring(i + 1, 1) === "=") break;
        i++;
      }
      push(action.Substring(tokenStart, i - tokenStart));
    }

    return tokens.ToArray();
  }

  static parsePipeline(tokens: string[]): Pipeline {
    const parser = new PipelineParser(tokens);
    return parser.parsePipeline(false);
  }

  static sliceTokens(tokens: string[], startIndex: int): string[] {
    const out = new List<string>();
    for (let i = startIndex; i < tokens.Length; i++) out.Add(tokens[i]!);
    return out.ToArray();
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
    const t = this.token.Trim();
    if (
      t === "." ||
      t === "$" ||
      t.StartsWith(".") ||
      t.StartsWith("$") ||
      t.StartsWith("site") ||
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
    while (this.idx < this.tokens.Length) {
      const t = this.tokens[this.idx]!;
      if (stopOnRightParen && t === ")") break;
      if (t === "|") {
        this.idx++;
        continue;
      }
      stages.Add(this.parseCommand());
      if (this.idx < this.tokens.Length && this.tokens[this.idx]! === "|") this.idx++;
    }
    return new Pipeline(stages.ToArray());
  }

  private parseCommand(): Command {
    const head = this.parseExpr();
    const args = new List<Expr>();

    while (this.idx < this.tokens.Length) {
      const t = this.tokens[this.idx]!;
      if (t === "|" || t === ")") break;
      args.Add(this.parseExpr());
    }

    return new Command(head, args.ToArray());
  }

  private parseExpr(): Expr {
    if (this.idx >= this.tokens.Length) return new TokenExpr("");
    const t = this.tokens[this.idx]!;

    if (t === "(") {
      this.idx++;
      const inner = this.parsePipeline(true);
      if (this.idx < this.tokens.Length && this.tokens[this.idx]! === ")") this.idx++;
      let expr: Expr = new PipelineExpr(inner);
      while (this.idx < this.tokens.Length) {
        const next = this.tokens[this.idx]!;
        if (next.StartsWith(".") && next !== ".") {
          const segs = next.Substring(1).Split(".");
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
    if (this.args.Length === 0 && piped === undefined) return this.head.eval(scope, env, overrides, defines);

    const head = this.head;
    if (head instanceof TokenExpr) {
      const tokenExpr = head as TokenExpr;
      const evaluatedArgs = new List<TemplateValue>();
      for (let i = 0; i < this.args.Length; i++) evaluatedArgs.Add(this.args[i]!.eval(scope, env, overrides, defines));
      if (piped !== undefined) evaluatedArgs.Add(piped);
      return TemplateRuntime.callFunction(tokenExpr.token, evaluatedArgs.ToArray(), scope, env, overrides, defines);
    }

    // Handle AccessExpr with args - method invocation on expression result
    // Example: (resources.ByType "image").GetMatch "foo*"
    if (head instanceof AccessExpr) {
      const accessExpr = head as AccessExpr;
      const segments = accessExpr.segments;
      if (segments.Length >= 1) {
        // Evaluate the receiver (base + all segments except last)
        let receiver = accessExpr.base.eval(scope, env, overrides, defines);
        if (segments.Length > 1) {
          const receiverSegs: string[] = [];
          for (let i = 0; i < segments.Length - 1; i++) receiverSegs[i] = segments[i]!;
          receiver = TemplateRuntime.resolvePath(receiver, receiverSegs, scope);
        }
        // The last segment is the method name
        const methodName = segments[segments.Length - 1]!;
        // Evaluate args
        const evaluatedArgs = new List<TemplateValue>();
        for (let i = 0; i < this.args.Length; i++) evaluatedArgs.Add(this.args[i]!.eval(scope, env, overrides, defines));
        if (piped !== undefined) evaluatedArgs.Add(piped);
        // Dispatch the method call
        return TemplateRuntime.callMethod(receiver, methodName, evaluatedArgs.ToArray(), scope, env, overrides, defines);
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
      if (elseTokens.Length >= 2) isElseIf = elseTokens[1] === "if";
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

    while (this.idx < this.segs.Length) {
      const seg = this.segs[this.idx]!;
      this.idx++;

      if (!seg.isAction) {
        nodes.Add(new TextNode(seg.text));
        continue;
      }

      if (seg.text.StartsWith("/*") && seg.text.EndsWith("*/")) {
        continue;
      }

      const tokens = TemplateRuntime.tokenizeAction(seg.text);
      if (tokens.Length === 0) continue;

      const head = tokens[0]!;
      if (head === "end") return new ParseNodesResult(nodes.ToArray(), false);
      if (head === "else") {
        if (stopOnElse) {
          this.lastElseTokens = tokens;
          return new ParseNodesResult(nodes.ToArray(), true);
        }
        continue;
      }

      if (head === "define" && tokens.Length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const body = this.parseNodes(false);
        this.defines.Remove(name);
        this.defines.Add(name, body.nodes);
        continue;
      }

      if (head === "block" && tokens.Length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.Length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        const ctx = TemplateRuntime.parsePipeline(ctxTokens);
        const body = this.parseNodes(false);
        nodes.Add(new BlockNode(name, ctx, body.nodes));
        continue;
      }

      if (head === "if") {
        const cond = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        nodes.Add(this.parseIfFrom(cond));
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
        nodes.Add(new WithNode(expr, body.nodes, elseNodes));
        continue;
      }

      if (head === "range") {
        let idx = 1;
        let keyVar: string | undefined = undefined;
        let valueVar: string | undefined = undefined;

        const first = idx < tokens.Length ? tokens[idx]! : "";
        const isVar = first.StartsWith("$") && first !== "$" && !first.StartsWith("$.");
        let hasDeclare = false;
        if (idx + 1 < tokens.Length) {
          const tok1 = tokens[idx + 1]!;
          hasDeclare = tok1 === ":=" || tok1 === "=";
        }
        let hasKeyValueDeclare = false;
        if (idx + 3 < tokens.Length) {
          const tok0 = tokens[idx]!;
          const tok1 = tokens[idx + 1]!;
          const tok2 = tokens[idx + 2]!;
          const tok3 = tokens[idx + 3]!;
          const isKvDeclareOp = tok3 === ":=" || tok3 === "=";
          hasKeyValueDeclare = tok0.StartsWith("$") && tok1 === "," && tok2.StartsWith("$") && isKvDeclareOp;
        }

        let exprTokens: string[] = [];
        if (hasKeyValueDeclare) {
          keyVar = tokens[idx]!.Substring(1);
          valueVar = tokens[idx + 2]!.Substring(1);
          idx += 4;
          exprTokens = TemplateRuntime.sliceTokens(tokens, idx);
        } else if (isVar && hasDeclare) {
          valueVar = tokens[idx]!.Substring(1);
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
        nodes.Add(new RangeNode(expr, keyVar, valueVar, body.nodes, elseNodes));
        continue;
      }

      if (head === "template" && tokens.Length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.Length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        nodes.Add(new TemplateInvokeNode(name, TemplateRuntime.parsePipeline(ctxTokens)));
        continue;
      }

      if (tokens.Length >= 3 && head.StartsWith("$") && head !== "$" && !head.StartsWith("$.")) {
        const tok1 = tokens[1]!;
        if (tok1 === ":=" || tok1 === "=") {
          const name = head.Substring(1);
          const declare = tok1 === ":=";
          const expr = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 2));
          nodes.Add(new AssignmentNode(name, expr, declare));
          continue;
        }
      }

      nodes.Add(new OutputNode(TemplateRuntime.parsePipeline(tokens), true));
    }

    return new ParseNodesResult(nodes.ToArray(), false);
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
