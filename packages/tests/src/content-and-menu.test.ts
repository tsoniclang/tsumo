import { attribute } from "@tsonic/core/lang.js";
import type { int } from "@tsonic/csharp/types.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import {
  buildMenuHierarchy,
  configureSiteMenus,
  ContentPageSource,
  discoverContent,
  FrontMatterMenu,
  HtmlString,
  MenuEntry,
  PageContext,
  PageFile,
  SiteConfig,
  SiteContext,
  TsumoError,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureContentDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a content or menu diagnostic");
};

const createMenuEntry = (identity: string, parent: string, weight: int, pageRef: string): MenuEntry =>
  new MenuEntry(identity, "", pageRef, "", weight, parent, identity, "", "", "main");

const createPage = (site: SiteContext, route: string, slug: string): PageContext => {
  const emptyHtml = new HtmlString("");
  const emptyPages: PageContext[] = [];
  const emptyStrings: string[] = [];
  return new PageContext(
    slug,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    false,
    "page",
    "articles",
    "articles",
    slug,
    route,
    "",
    emptyHtml,
    emptyHtml,
    emptyHtml,
    "",
    emptyStrings,
    emptyStrings,
    site.Params,
    undefined,
    site.Language,
    emptyPages,
    undefined,
    site,
    emptyPages,
    undefined,
    emptyPages,
    undefined,
  );
};

const createSource = (sourcePath: string, page: PageContext): ContentPageSource => {
  const emptyMenus: FrontMatterMenu[] = [];
  return new ContentPageSource(
    sourcePath,
    page.section,
    page.type,
    page.slug,
    page.title,
    new Date("2026-01-01T00:00:00.000Z"),
    page.date,
    page.lastmod,
    false,
    false,
    "",
    page.tags,
    page.categories,
    page.Params,
    "",
    page.relPermalink,
    "articles/post/index.html",
    undefined,
    new PageFile(sourcePath, "articles/", page.slug),
    emptyMenus,
  );
};

export class ContentAndMenuTests {
  content_discovery_is_deterministic_and_excludes_drafts_before_claiming_routes(): void {
    const root = createTestDirectory("content-discovery");
    try {
      File.WriteAllText(Path.Combine(root, "z.md"), "---\ntitle: Z\ndate: 2026-01-01T00:00:00Z\n---\nZ");
      File.WriteAllText(Path.Combine(root, "a.md"), "---\ntitle: A\ndate: 2026-01-01T00:00:00Z\n---\nA");
      File.WriteAllText(Path.Combine(root, "published.md"), "---\ntitle: Published\ndate: 2025-01-01T00:00:00Z\nslug: shared\n---\nPublished");
      File.WriteAllText(Path.Combine(root, "draft.md"), "---\ntitle: Draft\ndate: 2025-01-01T00:00:00Z\nslug: shared\ndraft: true\n---\nDraft");

      const production = discoverContent(root, false);
      Assert.Equal(3, production.pages.length);
      Assert.True(production.pages[0]!.relPermalink === "/a/");
      Assert.True(production.pages[1]!.relPermalink === "/z/");
      Assert.True(production.pages[2]!.relPermalink === "/shared/");
      Assert.Equal(
        "TSUMO_CONTENT_ROUTE_CONFLICT",
        captureContentDiagnostic(() => {
          discoverContent(root, true);
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  content_routes_reject_escape_segments_and_duplicate_outputs(): void {
    const escapeRoot = createTestDirectory("content-route-escape");
    const conflictRoot = createTestDirectory("content-route-conflict");
    try {
      File.WriteAllText(Path.Combine(escapeRoot, "bad.md"), "---\ntitle: Bad\nslug: ../outside\n---\nBad");
      Assert.Equal(
        "TSUMO_CONTENT_ROUTE_SEGMENT_INVALID",
        captureContentDiagnostic(() => {
          discoverContent(escapeRoot, false);
        }),
      );

      Directory.CreateDirectory(Path.Combine(conflictRoot, "guide"));
      File.WriteAllText(Path.Combine(conflictRoot, "guide.md"), "---\ntitle: Guide\n---\nPage");
      File.WriteAllText(Path.Combine(conflictRoot, "guide", "_index.md"), "---\ntitle: Guide index\n---\nList");
      Assert.Equal(
        "TSUMO_CONTENT_ROUTE_CONFLICT",
        captureContentDiagnostic(() => {
          discoverContent(conflictRoot, false);
        }),
      );
    } finally {
      deleteTestDirectory(conflictRoot);
      deleteTestDirectory(escapeRoot);
    }
  }

  menu_hierarchy_is_deterministic_and_fails_closed(): void {
    const hierarchy = buildMenuHierarchy([
      createMenuEntry("beta", "", 0, ""),
      createMenuEntry("child", "alpha", 0, ""),
      createMenuEntry("alpha", "", 0, ""),
    ]);
    Assert.Equal(2, hierarchy.length);
    Assert.True(hierarchy[0]!.identifier === "alpha");
    Assert.True(hierarchy[0]!.children[0]!.identifier === "child");
    Assert.True(hierarchy[1]!.identifier === "beta");

    Assert.Equal(
      "TSUMO_MENU_IDENTITY_DUPLICATE",
      captureContentDiagnostic(() => {
        buildMenuHierarchy([createMenuEntry("same", "", 0, ""), createMenuEntry("same", "", 1, "")]);
      }),
    );
    Assert.Equal(
      "TSUMO_MENU_PARENT_NOT_FOUND",
      captureContentDiagnostic(() => {
        buildMenuHierarchy([createMenuEntry("child", "missing", 0, "")]);
      }),
    );
    Assert.Equal(
      "TSUMO_MENU_PARENT_CYCLE",
      captureContentDiagnostic(() => {
        buildMenuHierarchy([createMenuEntry("one", "two", 0, ""), createMenuEntry("two", "one", 0, "")]);
      }),
    );
  }

  menu_page_references_use_exact_routes_without_slug_fallback(): void {
    const config = new SiteConfig("Test", "https://example.invalid/", "en", undefined, undefined);
    const site = new SiteContext(config, [], undefined, undefined);
    const page = createPage(site, "/articles/post/", "post");
    const source = createSource("/content/articles/post.md", page);
    const sources: ContentPageSource[] = [source];
    const pages: PageContext[] = [page];
    site.pages = pages;

    const exact = createMenuEntry("exact", "", 0, "/articles/post/");
    site.Menus.set("main", [exact]);
    configureSiteMenus(sources, pages, site);
    const resolvedPage = exact.page;
    Assert.True(resolvedPage !== undefined);
    if (resolvedPage === undefined) throw new Exception("Expected exact menu page resolution");
    Assert.Equal("/articles/post/", resolvedPage.relPermalink);

    site.Menus.set("main", [createMenuEntry("shorthand", "", 0, "post")]);
    Assert.Equal(
      "TSUMO_MENU_PAGE_REF_NOT_FOUND",
      captureContentDiagnostic(() => {
        configureSiteMenus(sources, pages, site);
      }),
    );
  }
}

attribute<ContentAndMenuTests>().method((target) => target.content_discovery_is_deterministic_and_excludes_drafts_before_claiming_routes).add(FactAttribute);
attribute<ContentAndMenuTests>().method((target) => target.content_routes_reject_escape_segments_and_duplicate_outputs).add(FactAttribute);
attribute<ContentAndMenuTests>().method((target) => target.menu_hierarchy_is_deterministic_and_fails_closed).add(FactAttribute);
attribute<ContentAndMenuTests>().method((target) => target.menu_page_references_use_exact_routes_without_slug_fallback).add(FactAttribute);
