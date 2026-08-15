import type { int32 } from "@tsonic/core/types.js";
import { PageContext } from "../../models.js";
import type { DocsMountContext, NavItem } from "../../docs/models.js";
import type { ResourceManager } from "../../resources.js";
import { readResourceText } from "../../resources/text.js";
import { HtmlString } from "../../utils/html.js";
import { parseInt32 } from "../../utils/int32.js";
import { substringCount, substringFrom, trimStartChar } from "../../utils/strings.js";
import { ensureTrailingSlash } from "../../utils/text.js";
import { HeadingHookValue, ImageHookValue, LinkHookValue, ShortcodeValue } from "../contexts.js";
import { nil } from "../runtime-helpers.js";
import type { RenderScope } from "../scope.js";
import {
  BoolValue, DateValue, DictValue, DocsMountArrayValue, DocsMountValue,
  FileValue, HtmlValue, LanguageValue,
  MediaTypeValue, MenuArrayValue, MenuEntryValue, MenusValue,
  NavArrayValue, NavItemValue, NilValue, NumberValue, OutputFormatValue,
  OutputFormatsGetValue, OutputFormatsValue, PageArrayValue, PageDataValue, PageGroupValue, PageResourcesValue, PaginatorValue,
  PageValue, ResourceDataValue, ResourceValue, ScratchValue,
  SiteValue, SitesArrayValue, SitesValue, StringArrayValue,
  StringValue, TaxonomiesValue, TaxonomyTermsValue, TemplateValue,
  UrlQueryValue, UrlValue,
} from "../values.js";
import {
  copyPageArray, copyStringArray, pageWeight, pagesWithKind, resolvePageCollectionProperty, siteLastModification,
} from "./page-semantics.js";
import {
  getPageStore, getSiteStore, taxonomyTermsByCount, wrapLanguages, wrapMediaType, wrapParamDict,
} from "./property-support.js";
import { splitUrlParts } from "./url-property-semantics.js";
import { getUrlQueryValue, parseUrlQuery } from "./url-query-semantics.js";

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
      else if (k === "date" || k === "publishdate") cur = new DateValue(page.date);
      else if (k === "lastmod") cur = new DateValue(page.lastmod);
      else if (k === "plain") cur = new StringValue(page.plain);
      else if (k === "tableofcontents") cur = new HtmlValue(page.tableOfContents);
      else if (k === "draft") cur = new BoolValue(page.draft);
      else if (k === "weight") cur = new NumberValue(pageWeight(page));
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
      else if (k === "store" || k === "scratch") cur = new ScratchValue(getPageStore(page));
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
      else if (k === "regularpages") cur = new PageArrayValue(pagesWithKind(page.pages, "page"));
      else if (k === "sections") cur = new PageArrayValue(pagesWithKind(page.pages, "section"));
      else if (k === "data") cur = new PageDataValue(page);
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
      else if (k === "truncated") cur = new BoolValue(
        page.summary.value !== "" && page.summary.value !== page.content.value,
      );
      else if (k === "linktitle") cur = new StringValue(page.title);
      else if (k === "outputformats") cur = new OutputFormatsValue(page.site);
      else if (k === "paginator") {
        const selected = scope.getPaginator();
        if (selected !== undefined) cur = selected;
        else {
          cur = scope.selectPaginator(new PaginatorValue(
            page.pages,
            scope.site.paginationSize,
            scope.state.paginationPageNumber,
            page.relPermalink,
          ));
        }
      }
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

    if (cur instanceof DateValue) {
      const key = seg.toLowerCase();
      if (key === "iszero") cur = new BoolValue(cur.value.trim() === "" || Number.isNaN(Date.parse(cur.value)));
      else if (key === "year") {
        const milliseconds = Date.parse(cur.value);
        let year: int32 = 0;
        if (!Number.isNaN(milliseconds)) {
          year = parseInt32(substringCount(new Date(milliseconds).toISOString(), 0, 4)) ?? 0;
        }
        cur = new NumberValue(year);
      } else cur = nil;
      continue;
    }

    if (cur instanceof PageDataValue) {
      const page = cur.page;
      const key = seg.toLowerCase();
      if (key === "pages") cur = new PageArrayValue(page.pages);
      else if (key === "terms") {
        const terms = page.site.Taxonomies.get(page.section) ?? page.site.Taxonomies.get(page.section.toLowerCase());
        cur = terms !== undefined ? new TaxonomyTermsValue(terms, page.site) : nil;
      } else cur = nil;
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
      else if (k === "store" || k === "scratch") cur = new ScratchValue(getSiteStore(site));
      else if (k === "params") cur = wrapParamDict(site.Params);
      else if (k === "pages") cur = new PageArrayValue(site.pages);
      else if (k === "regularpages") {
        const pages = site.allPages.length > 0 ? site.allPages : site.pages;
        cur = new PageArrayValue(pagesWithKind(pages, "page"));
      }
      else if (k === "lastmod") cur = new DateValue(siteLastModification(site));
      else if (k === "data") cur = scope.env.getSiteData();
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
      else if (k === "pageinner") cur = new PageValue(hook.PageInner);
      else if (k === "pageouter") cur = new PageValue(hook.PageOuter);
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
      else if (k === "pageinner") cur = new PageValue(hook.PageInner);
      else if (k === "pageouter") cur = new PageValue(hook.PageOuter);
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
      else if (k === "pageinner") cur = new PageValue(hook.PageInner);
      else if (k === "pageouter") cur = new PageValue(hook.PageOuter);
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
      if (seg.toLowerCase() === "bycount") {
        cur = taxonomyTermsByCount(termsDict);
        continue;
      }
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
      if (k === "path" || k === "rawquery" || k === "fragment" || k === "query") {
        const parts = splitUrlParts(uri);
        if (k === "path") cur = new StringValue(parts.path);
        else if (k === "rawquery") cur = new StringValue(parts.rawQuery);
        else if (k === "fragment") cur = new StringValue(parts.fragment);
        else cur = parseUrlQuery(parts.rawQuery);
        continue;
      }
      cur = nil;
      continue;
    }

    if (cur instanceof UrlQueryValue) {
      const selected = getUrlQueryValue(cur.value, seg);
      cur = selected === undefined ? nil : new StringValue(selected);
      continue;
    }

    if (cur instanceof ResourceValue) {
      const rv = cur as ResourceValue;
      const res = rv.value;
      const k = seg.toLowerCase();
      if (k === "content") {
        cur = new StringValue(readResourceText(res, "Resource.Content"));
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

    if (cur instanceof PaginatorValue) {
      const key = seg.toLowerCase();
      const totalPages = cur.totalPages();
      if (key === "pages") cur = new PageArrayValue(cur.pages());
      else if (key === "hasprev") cur = new BoolValue(cur.pageNumber > 1);
      else if (key === "hasnext") cur = new BoolValue(cur.pageNumber < totalPages);
      else if (key === "pagenumber") cur = new NumberValue(cur.pageNumber);
      else if (key === "totalpages") cur = new NumberValue(totalPages);
      else if (key === "prev") cur = cur.pageNumber > 1 ? cur.withPageNumber(cur.pageNumber - 1) : nil;
      else if (key === "next") cur = cur.pageNumber < totalPages ? cur.withPageNumber(cur.pageNumber + 1) : nil;
      else if (key === "url") cur = new StringValue(cur.url());
      else cur = nil;
      continue;
    }

    if (cur instanceof PageGroupValue) {
      const group = cur as PageGroupValue;
      const key = seg.toLowerCase();
      if (key === "key") cur = group.key;
      else if (key === "pages") cur = new PageArrayValue(group.pages);
      else cur = resolvePageCollectionProperty(new PageArrayValue(group.pages), seg) ?? nil;
      continue;
    }

    if (cur instanceof PageArrayValue) {
      cur = resolvePageCollectionProperty(cur as PageArrayValue, seg) ?? nil;
      continue;
    }

    return nil;
  }
  return cur;
};
