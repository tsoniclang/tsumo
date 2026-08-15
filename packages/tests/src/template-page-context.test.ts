import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";

import {
  DateValue,
  MenuEntry,
  PageContext,
  PageValue,
  ParamValue,
  parseTemplate,
  RenderScope,
  ResourceManager,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";
import {
  createPage, createSite, renderWithRoot, TestTemplateEnvironment,
} from "./template-test-harness.js";

export class TemplatePageContextTests {
  date_page_data_and_render_methods_use_typed_context(): void {
    Assert.Equal("2024-01-02", renderWithRoot("{{ .Format \"2006-01-02\" }}", new DateValue("2024-01-02T03:04:05Z")));

    const site = createSite();
    const older = createPage(site, "Older", "2022-04-01T00:00:00Z", "page");
    const newer = createPage(site, "Newer", "2024-06-01T00:00:00Z", "page");
    older.Params.set("weight", ParamValue.number(20));
    newer.Params.set("weight", ParamValue.number(10));
    const root = createPage(site, "Home", "", "home");
    root.pages = [older, newer];
    const section = createPage(site, "Section", "", "section");
    root.pages.push(section);
    site.pages = root.pages;
    site.allPages = root.pages;
    Assert.Equal(
      "value",
      renderWithRoot("{{ .Scratch.Set \"key\" \"value\" }}{{ .Scratch.Get \"key\" }}", new PageValue(root)),
    );
    Assert.Equal(
      "2024:Newer;2022:Older;",
      renderWithRoot("{{ range .Data.Pages.GroupByDate \"2006\" }}{{ .Key }}:{{ range .Pages }}{{ .Title }}{{ end }};{{ end }}", new PageValue(root)),
    );
    Assert.Equal(
      "0:Section;10:Newer;20:Older;|20:Older;10:Newer;0:Section;|SectionNewerOlder",
      renderWithRoot(
        "{{ range .Data.Pages.GroupBy \"Weight\" }}{{ .Key }}:{{ range .ByTitle }}{{ .Title }}{{ end }};{{ end }}|" +
        "{{ range .Data.Pages.GroupBy \"Weight\" \"desc\" }}{{ .Key }}:{{ range .Pages }}{{ .Title }}{{ end }};{{ end }}|" +
        "{{ range .Data.Pages.ByWeight }}{{ .Title }}{{ end }}",
        new PageValue(root),
      ),
    );
    Assert.Equal("3", renderWithRoot("{{ len (union .RegularPages .Sections) }}", new PageValue(root)));

    const environment = new TestTemplateEnvironment();
    Assert.Equal(
      "2024",
      environment.renderTemplate(parseTemplate("{{ .Site.Lastmod.Format \"2006\" }}"), new PageValue(root), site, new Map()),
    );
    environment.templates.set("_partials/templates/_funcs/child", parseTemplate("child={{ . }}", "_partials/templates/_funcs/child.html"));
    const parent = parseTemplate("{{ partial \"_funcs/child\" \"exact\" }}", "_partials/templates/parent.html");
    const parentScope = new RenderScope(new PageValue(root), new PageValue(root), site, environment, undefined, undefined, parent.sourcePath);
    const output = new StringBuilder();
    parent.renderInto(output, parentScope, environment, new Map());
    Assert.Equal("child=exact", output.ToString());

    const pageTemplate = parseTemplate("{{ .Render \"summary\" }}");
    const pageOutput = new StringBuilder();
    const pageScope = new RenderScope(new PageValue(newer), new PageValue(newer), site, environment, undefined);
    pageTemplate.renderInto(pageOutput, pageScope, environment, new Map());
    Assert.Equal("<summary>Newer</summary>", pageOutput.ToString());
  }

  page_taxonomy_terms_follow_explicit_graph_relations(): void {
    const site = createSite();
    const page = createPage(site, "Article", "2024-01-01T00:00:00Z", "page");
    const term = createPage(site, "TypeScript", "", "term");
    const memberships = new Map<string, PageContext[]>();
    memberships.set("typescript", [page]);
    site.Taxonomies.set("tags", memberships);
    const termPages = new Map<string, PageContext>();
    termPages.set("typescript", term);
    site.taxonomyTermPages.set("tags", termPages);

    Assert.Equal(
      "TypeScript;",
      renderWithRoot("{{ range .GetTerms \"tags\" }}{{ .Title }};{{ end }}", new PageValue(page)),
    );
  }

  page_menu_methods_use_the_exact_menu_hierarchy(): void {
    const site = createSite();
    const section = createPage(site, "Section", "", "section");
    const article = createPage(site, "Article", "", "page");
    const parent = new MenuEntry("Section", "", "", "", 0, "", "section", "", "", "main");
    const child = new MenuEntry("Article", "", "", "", 0, "section", "article", "", "", "main");
    parent.page = section;
    child.page = article;
    parent.children = [child];
    site.Menus.set("main", [parent]);

    Assert.Equal(
      "true|false|false|true|false",
      renderWithRoot(
        "{{ range .Site.Menus.main }}{{ $.HasMenuCurrent \"main\" . }}|{{ $.IsMenuCurrent \"main\" . }}|" +
        "{{ range .Children }}{{ $.HasMenuCurrent \"main\" . }}|{{ $.IsMenuCurrent \"main\" . }}|" +
        "{{ $.IsMenuCurrent \"other\" . }}{{ end }}{{ end }}",
        new PageValue(article),
      ),
    );
  }

  template_definitions_propagate_across_partial_boundaries(): void {
    const site = createSite();
    const root = createPage(site, "Home", "", "home");
    const environment = new TestTemplateEnvironment();
    environment.templates.set(
      "partials/child",
      parseTemplate("{{ template \"integrity\" . }}", "partials/child"),
    );

    const parent = parseTemplate(
      "{{ define \"integrity\" }}integrity={{ . }}{{ end }}{{ partial \"child\" \"external\" }}",
      "partials/parent",
    );
    Assert.Equal(
      "integrity=external",
      environment.renderTemplate(parent, new PageValue(root), site, new Map()),
    );

    const inline = parseTemplate(
      "{{ define \"_partials/inline\" }}inline={{ . }}{{ end }}{{ partials.IncludeCached \"inline\" \"local\" }}",
      "partials/inline-owner",
    );
    Assert.Equal(
      "inline=local",
      environment.renderTemplate(inline, new PageValue(root), site, new Map()),
    );

    environment.templates.set(
      "partials/page-global",
      parseTemplate(
        "{{ page.Title }}|{{ page.Store.Add \"visits\" 1 }}{{ page.Store.Get \"visits\" }}",
        "partials/page-global",
      ),
    );
    const contextual = parseTemplate("{{ partial \"page-global\" (dict \"context\" \"changed\") }}");
    Assert.Equal(
      "Home|1",
      environment.renderTemplate(contextual, new PageValue(root), site, new Map()),
    );
  }

  page_resources_use_the_published_bundle_inventory(): void {
    const root = createTestDirectory("template-page-resources");
    const siteDirectory = Path.Combine(root, "site");
    const bundleDirectory = Path.Combine(siteDirectory, "content", "article");
    const outputDirectory = Path.Combine(root, "output");
    try {
      Directory.CreateDirectory(bundleDirectory);
      File.WriteAllText(Path.Combine(bundleDirectory, "cover.svg"), "<svg></svg>");
      File.WriteAllText(Path.Combine(bundleDirectory, "notes.txt"), "notes");

      const manager = new ResourceManager(siteDirectory, undefined, outputDirectory);
      const environment = new TestTemplateEnvironment(manager);
      const site = createSite();
      const page = createPage(site, "Article", "", "page");
      page.relPermalink = "/article/";
      page.resourceSourceDir = bundleDirectory;
      const template = parseTemplate(
        "{{ $images := .Resources.ByType \"image\" }}" +
        "{{ with $images.GetMatch \"*.svg\" }}{{ .RelPermalink }}{{ end }}|" +
        "{{ with ($images.GetMatch \"{*cover*,*thumbnail*}\") }}{{ .RelPermalink }}{{ end }}|" +
        "{{ with .Resources.Get \"notes.txt\" }}{{ .RelPermalink }}{{ end }}",
      );

      Assert.Equal(
        "/article/cover.svg|/article/cover.svg|/article/notes.txt",
        environment.renderTemplate(template, new PageValue(page), site, new Map()),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<TemplatePageContextTests>().method((target) => target.date_page_data_and_render_methods_use_typed_context).add(FactAttribute);
attribute<TemplatePageContextTests>().method((target) => target.page_taxonomy_terms_follow_explicit_graph_relations).add(FactAttribute);
attribute<TemplatePageContextTests>().method((target) => target.page_menu_methods_use_the_exact_menu_hierarchy).add(FactAttribute);
attribute<TemplatePageContextTests>().method((target) => target.template_definitions_propagate_across_partial_boundaries).add(FactAttribute);
attribute<TemplatePageContextTests>().method((target) => target.page_resources_use_the_published_bundle_inventory).add(FactAttribute);
