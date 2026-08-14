import { Uri } from "@tsonic/dotnet/System.js";
import type { int32 } from "@tsonic/core/types.js";
import { LanguageContext, MediaType, PageContext, SiteContext } from "../../models.js";
import type { DocsMountContext, NavItem } from "../../docs/models.js";
import { ParamKind, ParamValue } from "../../params.js";
import type { ResourceManager } from "../../resources.js";
import { HtmlString } from "../../utils/html.js";
import { substringCount, substringFrom, trimStartChar } from "../../utils/strings.js";
import { ensureTrailingSlash } from "../../utils/text.js";
import { HeadingHookValue, ImageHookValue, LinkHookValue, ShortcodeValue } from "../contexts.js";
import { nil } from "../runtime-helpers.js";
import type { RenderScope } from "../scope.js";
import {
  AnyArrayValue, BoolValue, DictValue, DocsMountArrayValue, DocsMountValue,
  FileValue, HtmlValue, LanguageValue,
  MediaTypeValue, MenuArrayValue, MenuEntryValue, MenusValue,
  NavArrayValue, NavItemValue, NilValue, NumberValue, OutputFormatValue,
  OutputFormatsGetValue, OutputFormatsValue, PageArrayValue, PageResourcesValue,
  PageValue, ResourceDataValue, ResourceValue, ScratchStore, ScratchValue,
  SiteValue, SitesArrayValue, SitesValue, StringArrayValue,
  StringValue, TaxonomiesValue, TaxonomyTermsValue, TemplateValue, UrlParts,
  UrlValue,
} from "../values.js";
import {
  copyPageArray, copyStringArray, reversePages, sortPagesByDate,
  sortPagesByTitle, sortPagesByWeight,
} from "./page-semantics.js";

const pageStores = new Map<PageContext, ScratchStore>();
const siteStores = new Map<SiteContext, ScratchStore>();

export const resolvePath = (value: TemplateValue, segments: string[], scope: RenderScope): TemplateValue => {
  let cur: TemplateValue = value;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (cur instanceof NilValue) return nil;

    if (cur instanceof PageValue) {
      const page = cur.value;
      const k = seg.toLowerCase();
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
      else if (k === "layout") {
        const pageLayout = page.layout;
        cur = pageLayout !== undefined && pageLayout.trim() !== "" ? new StringValue(pageLayout) : nil;
      }
      else if (k === "file") {
        const pageFile = page.File;
        cur = pageFile !== undefined ? new FileValue(pageFile) : nil;
      }
      else if (k === "language") cur = new LanguageValue(page.Language);
      else if (k === "translations") cur = new PageArrayValue(page.Translations);
      else if (k === "store") cur = new ScratchValue(getPageStore(page));
      else if (k === "sites") cur = new SitesValue(scope.site);
      else if (k === "page") cur = cur;
      else if (k === "parent") {
        const pageParent = page.parent;
        cur = pageParent !== undefined ? new PageValue(pageParent) : nil;
      }
      else if (k === "ancestors") cur = new PageArrayValue(page.ancestors);
      else if (k === "permalink") {
        const rel = page.relPermalink.startsWith("/") ? substringFrom(page.relPermalink, 1) : page.relPermalink;
        cur = new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
      } else if (k === "site") cur = new SiteValue(page.site);
      else if (k === "resources") {
        const mgr = scope.env.getResourceManager();
        cur = mgr !== undefined ? new PageResourcesValue(page, mgr) : nil;
      }
      else if (k === "pages") cur = new PageArrayValue(page.pages);
      else if (k === "description") cur = new StringValue(page.description);
      else if (k === "tags") cur = new StringArrayValue(page.tags);
      else if (k === "categories") cur = new StringArrayValue(page.categories);
      else if (k === "params") cur = wrapParamDict(page.Params);
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
          const siblings = copyPageArray(parentPage.pages);
          let foundIdx: int32 = -1;
          for (let pi = 0; pi < siblings.length; pi++) {
            const sibling = siblings[pi]!;
            if (sibling.relPermalink === page.relPermalink) {
              foundIdx = pi;
              break;
            }
          }
          if (foundIdx > 0) {
            const prevIdx: int32 = foundIdx - 1;
            cur = new PageValue(siblings[prevIdx]!);
          } else {
            cur = nil;
          }
        } else {
          cur = nil;
        }
      }
      else if (k === "nextinsection") {
        const parentPage = page.parent;
        if (parentPage !== undefined) {
          const siblings = copyPageArray(parentPage.pages);
          let foundIdx: int32 = -1;
          for (let ni = 0; ni < siblings.length; ni++) {
            const sibling = siblings[ni]!;
            if (sibling.relPermalink === page.relPermalink) {
              foundIdx = ni;
              break;
            }
          }
          if (foundIdx >= 0 && foundIdx < siblings.length - 1) {
            const nextIdx: int32 = foundIdx + 1;
            cur = new PageValue(siblings[nextIdx]!);
          } else {
            cur = nil;
          }
        } else {
          cur = nil;
        }
      }
      else cur = nil;
      continue;
    }

    if (cur instanceof SiteValue) {
      const site = cur.value;
      const k = seg.toLowerCase();
      if (k === "title") cur = new StringValue(site.title);
      else if (k === "baseurl") cur = new StringValue(site.baseURL);
      else if (k === "languagecode") cur = new StringValue(site.languageCode);
      else if (k === "copyright") cur = new StringValue(site.copyright);
      else if (k === "language") cur = new LanguageValue(site.Language);
      else if (k === "languages") cur = wrapLanguages(site.Languages);
      else if (k === "ismultilingual") cur = new BoolValue(site.IsMultiLingual);
      else if (k === "languageprefix") cur = new StringValue(site.LanguagePrefix);
      else if (k === "home") {
        const siteHome = site.home;
        cur = siteHome !== undefined ? new PageValue(siteHome) : nil;
      }
      else if (k === "allpages") cur = new PageArrayValue(site.allPages);
      else if (k === "store") cur = new ScratchValue(getSiteStore(site));
      else if (k === "params") cur = wrapParamDict(site.Params);
      else if (k === "pages") cur = new PageArrayValue(site.pages);
      else if (k === "mounts" || k === "docsmounts") cur = new DocsMountArrayValue(site.docsMounts);
      else if (k === "menus") cur = new MenusValue(site);
      else if (k === "taxonomies") cur = new TaxonomiesValue(site);
      else if (k === "outputformats") cur = new OutputFormatsValue(site);
      else if (k === "sites") cur = new SitesArrayValue(site.Sites);
      else cur = nil;
      continue;
    }

    if (cur instanceof LanguageValue) {
      const lang = cur.value;
      const k = seg.toLowerCase();
      if (k === "lang") cur = new StringValue(lang.Lang);
      else if (k === "languagename") cur = new StringValue(lang.LanguageName);
      else if (k === "languagedirection") cur = new StringValue(lang.LanguageDirection);
      else cur = nil;
      continue;
    }

    if (cur instanceof FileValue) {
      const f = cur.value;
      const k = seg.toLowerCase();
      if (k === "filename") cur = new StringValue(f.Filename);
      else if (k === "dir") cur = new StringValue(f.Dir);
      else if (k === "basefilename") cur = new StringValue(f.BaseFileName);
      else cur = nil;
      continue;
    }

    if (cur instanceof SitesValue) {
      const k = seg.toLowerCase();
      if (k === "default") cur = new SiteValue(cur.value);
      else cur = nil;
      continue;
    }

    if (cur instanceof MenusValue) {
      const site = cur.site;
      const entries = site.Menus.get(seg) ?? site.Menus.get(seg.toLowerCase());
      cur = entries !== undefined ? new MenuArrayValue(entries, site) : nil;
      continue;
    }

    if (cur instanceof MenuEntryValue) {
      const entry = cur.value;
      const site = cur.site;
      const k = seg.toLowerCase();
      if (k === "name") cur = new StringValue(entry.name);
      else if (k === "url") {
        const entryPageForUrl = entry.page;
        cur = new StringValue(entry.url !== "" ? entry.url : entryPageForUrl !== undefined ? entryPageForUrl.relPermalink : "");
      }
      else if (k === "title") cur = new StringValue(entry.title);
      else if (k === "weight") cur = new NumberValue(entry.weight);
      else if (k === "parent") cur = new StringValue(entry.parent);
      else if (k === "identifier") cur = new StringValue(entry.identifier);
      else if (k === "pre") cur = new StringValue(entry.pre);
      else if (k === "post") cur = new StringValue(entry.post);
      else if (k === "menu") cur = new StringValue(entry.menu);
      else if (k === "page") {
        const entryPage = entry.page;
        cur = entryPage !== undefined ? new PageValue(entryPage) : nil;
      }
      else if (k === "children") cur = new MenuArrayValue(entry.children, site);
      else if (k === "params") cur = wrapParamDict(entry.Params);
      else cur = nil;
      continue;
    }

    if (cur instanceof OutputFormatsValue) {
      const site = cur.site;
      const k = seg.toLowerCase();
      if (k === "get") {
        cur = new OutputFormatsGetValue(site);
      } else {
        cur = nil;
      }
      continue;
    }

    if (cur instanceof OutputFormatValue) {
      const fmt = cur.value;
      const k = seg.toLowerCase();
      if (k === "rel") cur = new StringValue(fmt.Rel);
      else if (k === "mediatype") cur = wrapMediaType(fmt.MediaType);
      else if (k === "permalink") cur = new StringValue(fmt.Permalink);
      else cur = nil;
      continue;
    }

    if (cur instanceof MediaTypeValue) {
      const mt = cur.value;
      const k = seg.toLowerCase();
      if (k === "type") cur = new StringValue(mt.Type);
      else cur = nil;
      continue;
    }

    if (cur instanceof ShortcodeValue) {
      const sc = cur.value;
      const k = seg.toLowerCase();
      if (k === "name") cur = new StringValue(sc.name);
      else if (k === "page") cur = new PageValue(sc.Page);
      else if (k === "site") cur = new SiteValue(sc.Site);
      else if (k === "params") cur = wrapParamDict(sc.Params);
      else if (k === "isnamedparams") cur = new BoolValue(sc.IsNamedParams);
      else if (k === "inner") cur = new HtmlValue(new HtmlString(sc.Inner));
      else if (k === "innerdeindent") cur = new HtmlValue(new HtmlString(sc.InnerDeindent));
      else if (k === "ordinal") cur = new NumberValue(sc.Ordinal);
      else if (k === "parent") {
        const scParent = sc.Parent;
        cur = scParent !== undefined ? new ShortcodeValue(scParent) : nil;
      }
      else cur = nil;
      continue;
    }

    if (cur instanceof LinkHookValue) {
      const hook = cur.value;
      const k = seg.toLowerCase();
      if (k === "destination") cur = new StringValue(hook.Destination);
      else if (k === "text") cur = new HtmlValue(new HtmlString(hook.Text));
      else if (k === "title") cur = new StringValue(hook.Title);
      else if (k === "plaintext") cur = new StringValue(hook.PlainText);
      else if (k === "page") cur = new PageValue(hook.Page);
      else cur = nil;
      continue;
    }

    if (cur instanceof ImageHookValue) {
      const hook = cur.value;
      const k = seg.toLowerCase();
      if (k === "destination") cur = new StringValue(hook.Destination);
      else if (k === "text") cur = new StringValue(hook.Text);
      else if (k === "title") cur = new StringValue(hook.Title);
      else if (k === "plaintext") cur = new StringValue(hook.PlainText);
      else if (k === "page") cur = new PageValue(hook.Page);
      else cur = nil;
      continue;
    }

    if (cur instanceof HeadingHookValue) {
      const hook = cur.value;
      const k = seg.toLowerCase();
      if (k === "level") cur = new NumberValue(hook.Level);
      else if (k === "text") cur = new HtmlValue(new HtmlString(hook.Text));
      else if (k === "plaintext") cur = new StringValue(hook.PlainText);
      else if (k === "anchor") cur = new StringValue(hook.Anchor);
      else if (k === "page") cur = new PageValue(hook.Page);
      else cur = nil;
      continue;
    }

    if (cur instanceof TaxonomiesValue) {
      const site = cur.site;
      const terms = site.Taxonomies.get(seg) ?? site.Taxonomies.get(seg.toLowerCase());
      cur = terms !== undefined ? new TaxonomyTermsValue(terms, site) : nil;
      continue;
    }

    if (cur instanceof TaxonomyTermsValue) {
      const termsDict = cur.terms;
      const site = cur.site;
      const pages = termsDict.get(seg) ?? termsDict.get(seg.toLowerCase());
      cur = pages !== undefined ? new PageArrayValue(pages) : nil;
      continue;
    }

    if (cur instanceof UrlValue) {
      const uri = cur.value;
      const k = seg.toLowerCase();
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
        const parts = splitUrlParts(uri);
        if (k === "path") cur = new StringValue(parts.path);
        else if (k === "rawquery") cur = new StringValue(parts.rawQuery);
        else cur = new StringValue(parts.fragment);
        continue;
      }
      cur = nil;
      continue;
    }

    if (cur instanceof ResourceValue) {
      const rv = cur as ResourceValue;
      const res = rv.value;
      const k = seg.toLowerCase();
      if (k === "content") {
        cur = new StringValue(res.text ?? "");
        continue;
      }
      if (k === "data") {
        cur = new ResourceDataValue(res.Data);
        continue;
      }
      if (k === "relpermalink") {
        const outputRelPath = res.outputRelPath;
        if (outputRelPath === undefined || outputRelPath.trim() === "") {
          cur = nil;
          continue;
        }
        rv.manager.ensurePublished(res);
        const slash = "/";
        const rel = trimStartChar(outputRelPath, slash);
        cur = new StringValue("/" + rel);
        continue;
      }
      if (k === "permalink") {
        const outputRelPath = res.outputRelPath;
        if (outputRelPath === undefined || outputRelPath.trim() === "") {
          cur = nil;
          continue;
        }
        rv.manager.ensurePublished(res);
        const slash = "/";
        const rel = trimStartChar(outputRelPath, slash);
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
      cur = nil;
      continue;
    }

    if (cur instanceof ResourceDataValue) {
      const data = cur.value;
      const k = seg.toLowerCase();
      if (k === "integrity") {
        cur = new StringValue(data.Integrity);
        continue;
      }
      cur = nil;
      continue;
    }

    if (cur instanceof DocsMountValue) {
      const mount = cur.value;
      const k = seg.toLowerCase();
      if (k === "name") cur = new StringValue(mount.name);
      else if (k === "urlprefix") cur = new StringValue(mount.urlPrefix);
      else if (k === "nav") cur = new NavArrayValue(mount.nav);
      else cur = nil;
      continue;
    }

    if (cur instanceof NavItemValue) {
      const item = cur.value;
      const k = seg.toLowerCase();
      if (k === "title") cur = new StringValue(item.title);
      else if (k === "url") cur = new StringValue(item.url);
      else if (k === "children") cur = new NavArrayValue(item.children);
      else if (k === "issection") cur = new BoolValue(item.isSection);
      else if (k === "iscurrent") cur = new BoolValue(item.isCurrent);
      else if (k === "order") cur = new NumberValue(item.order);
      else cur = nil;
      continue;
    }

    if (cur instanceof DictValue) {
      const dict = cur.value;
      const direct = dict.get(seg);
      if (direct !== undefined) {
        cur = direct;
        continue;
      }
      const lowerKey = seg.toLowerCase();
      const lower = dict.get(lowerKey);
      if (lower !== undefined) {
        cur = lower;
        continue;
      }
      cur = nil;
      continue;
    }

    // Handle PageArrayValue zero-arg methods as properties
    if (cur instanceof PageArrayValue) {
      const pageArrVal = cur as PageArrayValue;
      const pages: PageContext[] = pageArrVal.value;
      const k = seg.toLowerCase();

      // Sorting methods (return sorted copy)
      if (k === "bylastmod") {
        const sorted = sortPagesByDate(pages, "lastmod");
        cur = new PageArrayValue(sorted);
        continue;
      }
      if (k === "bydate") {
        const sorted = sortPagesByDate(pages, "date");
        cur = new PageArrayValue(sorted);
        continue;
      }
      if (k === "bypublishdate") {
        const sorted = sortPagesByDate(pages, "publishdate");
        cur = new PageArrayValue(sorted);
        continue;
      }
      if (k === "bytitle") {
        const sorted = sortPagesByTitle(pages);
        cur = new PageArrayValue(sorted);
        continue;
      }
      if (k === "byweight") {
        const sorted = sortPagesByWeight();
        cur = new PageArrayValue(sorted);
        continue;
      }

      // Reverse (return reversed copy)
      if (k === "reverse") {
        const reversed = reversePages(pages);
        cur = new PageArrayValue(reversed);
        continue;
      }

      // Length property
      if (k === "len") {
        cur = new NumberValue(pages.length);
        continue;
      }

      cur = nil;
      continue;
    }

    return nil;
  }
  return cur;
};

export const wrapStringDict = (dict: Map<string, string>): DictValue => {
  const mapped = new Map<string, TemplateValue>();
  for (const key of dict.keys()) {
    const v = dict.get(key);
    if (v === undefined) continue;
    mapped.set(key, new StringValue(v));
  }
  return new DictValue(mapped);
};

export const wrapParamDict = (dict: Map<string, ParamValue>): DictValue => {
  const mapped = new Map<string, TemplateValue>();
  for (const key of dict.keys()) {
    const pv = dict.get(key);
    if (pv === undefined) continue;
    const kind = pv.kind;
    let tv: TemplateValue = new StringValue(pv.stringValue);
    if (kind === ParamKind.Bool) tv = new BoolValue(pv.boolValue);
    if (kind === ParamKind.Number) tv = new NumberValue(pv.numberValue);
    mapped.set(key, tv);
  }
  return new DictValue(mapped);
};

export const wrapLanguages = (languages: LanguageContext[]): AnyArrayValue => {
  const items: TemplateValue[] = [];
  for (let i = 0; i < languages.length; i++) items.push(new LanguageValue(languages[i]!));
  return new AnyArrayValue(items);
};

export const wrapMediaType = (mt: MediaType): MediaTypeValue => {
  return new MediaTypeValue(mt);
};

export const getPageStore = (page: PageContext): ScratchStore => {
  const existing = pageStores.get(page);
  if (existing !== undefined) return existing;
  const store = new ScratchStore();
  pageStores.set(page, store);
  return store;
};

export const getSiteStore = (site: SiteContext): ScratchStore => {
  const existing = siteStores.get(site);
  if (existing !== undefined) return existing;
  const store = new ScratchStore();
  siteStores.set(site, store);
  return store;
};

export const splitUrlParts = (uri: Uri): UrlParts => {
  let rawQuery = "";
  let fragment = "";
  if (uri.IsAbsoluteUri) {
    rawQuery = uri.Query.startsWith("?") ? substringFrom(uri.Query, 1) : uri.Query;
    fragment = uri.Fragment.startsWith("#") ? substringFrom(uri.Fragment, 1) : uri.Fragment;
    return new UrlParts(uri.AbsolutePath, rawQuery, fragment);
  }

  const raw = uri.OriginalString;
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? substringCount(raw, 0, hashIndex) : raw;
  fragment = hashIndex >= 0 ? substringFrom(raw, hashIndex + 1) : "";

  const queryIndex = beforeHash.indexOf("?");
  const path = queryIndex >= 0 ? substringCount(beforeHash, 0, queryIndex) : beforeHash;
  rawQuery = queryIndex >= 0 ? substringFrom(beforeHash, queryIndex + 1) : "";

  return new UrlParts(path, rawQuery, fragment);
};
