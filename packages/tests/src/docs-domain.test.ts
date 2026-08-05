import { attribute } from "@tsonic/core/lang.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import {
  discoverDocsMountRoutes,
  DocsLinkRewriteContext,
  DocsMountConfig,
  docsOutputPathForPermalink,
  DocsOutputClaims,
  loadDocsConfig,
  loadDocsContent,
  renderDocsMarkdown,
  renderSearchIndexJson,
  resolveDocsOutputPath,
  SearchDocument,
  TsumoError,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureDocsDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a docs diagnostic");
};

const createMount = (sourceDir: string, prefix: string): DocsMountConfig =>
  new DocsMountConfig("Docs", sourceDir, prefix, undefined, "main", undefined, undefined);

export class DocsDomainTests {
  route_discovery_is_sorted_and_rejects_output_collisions(): void {
    const root = createTestDirectory("docs-routes");
    try {
      const source = Path.Combine(root, "source");
      Directory.CreateDirectory(Path.Combine(source, "nested"));
      File.WriteAllText(Path.Combine(source, "z.md"), "# Z");
      File.WriteAllText(Path.Combine(source, "a.md"), "# A");
      File.WriteAllText(Path.Combine(source, "nested", "asset.txt"), "asset");

      const routes = discoverDocsMountRoutes(createMount(source, "/docs/"));
      Assert.Equal(2, routes.markdown.length);
      Assert.True(routes.markdown[0]!.relPath === "a.md");
      Assert.True(routes.markdown[1]!.relPath === "z.md");
      Assert.Equal(1, routes.assets.length);
      Assert.True(routes.assets[0]!.outputRelPath === "docs/nested/asset.txt");

      const conflicting = Path.Combine(root, "conflicting");
      Directory.CreateDirectory(Path.Combine(conflicting, "guide"));
      File.WriteAllText(Path.Combine(conflicting, "guide.md"), "# Guide");
      File.WriteAllText(Path.Combine(conflicting, "guide", "index.md"), "# Other guide");
      Assert.Equal(
        "TSUMO_DOCS_ROUTE_CONFLICT",
        captureDocsDiagnostic(() => {
          discoverDocsMountRoutes(createMount(conflicting, "/docs/"));
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  content_inventory_excludes_draft_leaf_routes(): void {
    const root = createTestDirectory("docs-content");
    try {
      File.WriteAllText(Path.Combine(root, "published.md"), "---\ntitle: Published\n---\nBody");
      File.WriteAllText(Path.Combine(root, "draft.md"), "---\ntitle: Draft\ndraft: true\n---\nHidden");
      const routes = discoverDocsMountRoutes(createMount(root, "/docs/")).markdown;

      const production = loadDocsContent(routes, false);
      Assert.Equal(1, production.leaves.length);
      Assert.True(production.permalinkByRelativePath.has("published.md"));
      Assert.True(!production.permalinkByRelativePath.has("draft.md"));

      const withDrafts = loadDocsContent(routes, true);
      Assert.Equal(2, withDrafts.leaves.length);
      Assert.True(withDrafts.permalinkByRelativePath.has("draft.md"));
    } finally {
      deleteTestDirectory(root);
    }
  }

  docs_config_has_one_closed_schema(): void {
    const root = createTestDirectory("docs-config");
    try {
      Directory.CreateDirectory(Path.Combine(root, "content"));
      const configPath = Path.Combine(root, "tsumo.docs.json");
      File.WriteAllText(
        configPath,
        "{\"siteName\":\"Contract\",\"mounts\":[{\"name\":\"Main\",\"source\":\"./content\",\"prefix\":\"/docs/\"}]}",
      );
      const loaded = loadDocsConfig(root);
      Assert.True(loaded !== undefined && loaded.config.mounts.length === 1);
      Assert.True(loaded !== undefined && loaded.config.mounts[0]!.urlPrefix === "/docs/");

      File.WriteAllText(
        configPath,
        "{\"mounts\":[{\"source\":\"./content\",\"prefix\":\"/docs/\",\"repo\":\"https://example.invalid\"}]}",
      );
      Assert.Equal(
        "TSUMO_DOCS_CONFIG_UNKNOWN_PROPERTY",
        captureDocsDiagnostic(() => {
          loadDocsConfig(root);
        }),
      );

      File.WriteAllText(
        configPath,
        "{\"search\":\"yes\",\"mounts\":[{\"source\":\"./content\",\"prefix\":\"/docs/\"}]}",
      );
      Assert.Equal(
        "TSUMO_DOCS_CONFIG_TYPE",
        captureDocsDiagnostic(() => {
          loadDocsConfig(root);
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  output_and_search_plans_are_exact_and_deterministic(): void {
    const root = createTestDirectory("docs-output");
    try {
      Assert.Equal("guide/index.html", docsOutputPathForPermalink("/guide/"));
      Assert.Equal(
        "TSUMO_DOCS_OUTPUT_PATH_ESCAPES_ROOT",
        captureDocsDiagnostic(() => {
          resolveDocsOutputPath(root, "../outside.html");
        }),
      );
      Assert.Equal(
        "TSUMO_DOCS_OUTPUT_PATH_ABSOLUTE",
        captureDocsDiagnostic(() => {
          resolveDocsOutputPath(root, "/outside.html");
        }),
      );

      const claims = new DocsOutputClaims();
      claims.add("docs/index.html", "first.md");
      Assert.Equal(
        "TSUMO_DOCS_ROUTE_CONFLICT",
        captureDocsDiagnostic(() => {
          claims.add("DOCS/index.html", "second.md");
        }),
      );

      const documents = [
        new SearchDocument("Zulu", "/z/", "Docs", "last"),
        new SearchDocument("Alpha", "/a/", "Docs", "quoted \"value\""),
      ];
      const expected = "[{\"title\":\"Alpha\",\"url\":\"/a/\",\"mount\":\"Docs\",\"text\":\"quoted \\\"value\\\"\"},{\"title\":\"Zulu\",\"url\":\"/z/\",\"mount\":\"Docs\",\"text\":\"last\"}]";
      Assert.Equal(expected, renderSearchIndexJson(documents));
      Assert.Equal(expected, renderSearchIndexJson(documents));
    } finally {
      deleteTestDirectory(root);
    }
  }

  strict_markdown_links_fail_closed(): void {
    const mount = createMount("/docs", "/docs/");
    const routes = new Map<string, string>();
    routes.set("known.md", "/docs/known/");
    const context = new DocsLinkRewriteContext(mount, "/docs/current.md", "", routes, true);
    const rendered = renderDocsMarkdown("[Known](known.md)", context);
    Assert.True(rendered.html.includes("/docs/known/"));
    Assert.Equal(
      "TSUMO_DOCS_LINK_UNRESOLVED",
      captureDocsDiagnostic(() => {
        renderDocsMarkdown("[Missing](missing.md)", context);
      }),
    );
    Assert.Equal(
      "TSUMO_DOCS_LINK_UNSAFE",
      captureDocsDiagnostic(() => {
        renderDocsMarkdown("[Unsafe](javascript:alert(1))", context);
      }),
    );
  }
}

attribute<DocsDomainTests>().method((target) => target.route_discovery_is_sorted_and_rejects_output_collisions).add(FactAttribute);
attribute<DocsDomainTests>().method((target) => target.content_inventory_excludes_draft_leaf_routes).add(FactAttribute);
attribute<DocsDomainTests>().method((target) => target.docs_config_has_one_closed_schema).add(FactAttribute);
attribute<DocsDomainTests>().method((target) => target.output_and_search_plans_are_exact_and_deterministic).add(FactAttribute);
attribute<DocsDomainTests>().method((target) => target.strict_markdown_links_fail_closed).add(FactAttribute);
