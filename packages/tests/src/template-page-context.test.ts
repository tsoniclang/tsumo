import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { join } from "node:path";

import {
  DateValue,
  MenuEntry,
  PageContext,
  PageValue,
  PaginatorValue,
  ParamValue,
  parseTemplate,
  RenderScope,
  ResourceManager,
  TextBuilder,
} from "@tsumo/engine/testing.js";
import { createDirectory, createTestDirectory, deleteTestDirectory, writeTextFile } from "./test-root.js";
import {
  createPage, createSite, renderWithRoot, TestTemplateEnvironment,
} from "./template-test-harness.js";

export class TemplatePageContextTests {
  page_sorts_preserve_ties_and_do_not_mutate_the_source(): void {
    const site = createSite();
    const root = createPage(site, "Home", "", "home");
    const first = createPage(site, "B", "2024-01-01T00:00:00Z", "page");
    const second = createPage(site, "A", "2024-01-01T00:00:00Z", "page");
    const last = createPage(site, "C", "2025-01-01T00:00:00Z", "page");
    first.Params.set("weight", ParamValue.number(-2147483648));
    second.Params.set("weight", ParamValue.number(-2147483648));
    last.Params.set("weight", ParamValue.number(2147483647));
    root.pages = [last, first, second];
    Assert.Equal("BAC|ABC|BAC|CBA", renderWithRoot(
      '{{ range .Pages.ByDate }}{{ .Title }}{{ end }}|' +
      '{{ range .Pages.ByTitle }}{{ .Title }}{{ end }}|' +
      '{{ range .Pages.ByWeight }}{{ .Title }}{{ end }}|' +
      '{{ range .Pages }}{{ .Title }}{{ end }}',
      new PageValue(root),
    ));
    Assert.Equal("2024:BA;2025:C;|2025:C;2024:BA;", renderWithRoot(
      '{{ range .Pages.GroupByDate "2006" "asc" }}{{ .Key }}:{{ range .Pages }}{{ .Title }}{{ end }};{{ end }}|' +
      '{{ range .Pages.GroupByDate "2006" "desc" }}{{ .Key }}:{{ range .Pages }}{{ .Title }}{{ end }};{{ end }}',
      new PageValue(root),
    ));
    root.pages = [];
    Assert.Equal("empty", renderWithRoot(
      '{{ range .Pages.ByWeight }}unexpected{{ else }}empty{{ end }}',
      new PageValue(root),
    ));
  }

  pagination_uses_exact_integer_ceiling_and_bounded_page_offsets(): void {
    const site = createSite();
    const first = createPage(site, "First", "", "page");
    const second = createPage(site, "Second", "", "page");
    const third = createPage(site, "Third", "", "page");
    const paginator = new PaginatorValue([first, second, third], 2, 1, "/posts/");
    Assert.True(paginator.totalPages() === 2);
    Assert.True(paginator.pages().length === 2 && paginator.pages()[0] === first);
    const last = paginator.withPageNumber(2);
    Assert.True(last.pages().length === 1 && last.pages()[0] === third);
    Assert.True(paginator.withPageNumber(2147483647).pages().length === 0);
    const empty = new PaginatorValue([], 0, 0, "/");
    Assert.True(empty.totalPages() === 1 && empty.pages().length === 0);
    const exact = new PaginatorValue([first, second], 2, 1, "/");
    Assert.True(exact.totalPages() === 1 && exact.pages().length === 2);
    const wide = new PaginatorValue([first, second, third], 2147483647, 1, "/");
    Assert.True(wide.totalPages() === 1 && wide.pages().length === 3);
  }

  date_page_data_and_render_methods_use_typed_context(): void {
    Assert.Equal("2024-01-02", renderWithRoot("{{ .Format \"2006-01-02\" }}", new DateValue("2024-01-02T03:04:05Z")));

    const site = createSite();
    const older = createPage(site, "Older", "2022-04-01T00:00:00Z", "page");
    const newer = createPage(site, "Newer", "2024-06-01T00:00:00Z", "page");
    older.Params.set("weight", ParamValue.number(20));
    newer.Params.set("weight", ParamValue.number(10));
    const root = createPage(site, "Home", "", "home");
    Assert.Equal("0|0", renderWithRoot(
      "{{ len .Pages.Reverse }}|{{ len (collections.Reverse .Pages) }}",
      new PageValue(root),
    ));
    root.pages = [older];
    Assert.Equal("Older|Older", renderWithRoot(
      "{{ range .Pages.Reverse }}{{ .Title }}{{ end }}|{{ range (collections.Reverse .Pages) }}{{ .Title }}{{ end }}",
      new PageValue(root),
    ));
    root.pages = [older, newer];
    Assert.Equal("NewerOlder|NewerOlder|OlderNewer", renderWithRoot(
      "{{ range .Pages.Reverse }}{{ .Title }}{{ end }}|{{ range (collections.Reverse .Pages) }}{{ .Title }}{{ end }}|" +
      "{{ range .Pages }}{{ .Title }}{{ end }}",
      new PageValue(root),
    ));
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
    const output = new TextBuilder();
    parent.renderInto(output, parentScope, environment, new Map());
    Assert.Equal("child=exact", output.toString());

    const pageTemplate = parseTemplate("{{ .Render \"summary\" }}");
    const pageOutput = new TextBuilder();
    const pageScope = new RenderScope(new PageValue(newer), new PageValue(newer), site, environment, undefined);
    pageTemplate.renderInto(pageOutput, pageScope, environment, new Map());
    Assert.Equal("<summary>Newer</summary>", pageOutput.toString());
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
    const siteDirectory = join(root, "site");
    const bundleDirectory = join(siteDirectory, "content", "article");
    const outputDirectory = join(root, "output");
    try {
      createDirectory(bundleDirectory);
      writeTextFile(join(bundleDirectory, "cover.svg"), "<svg></svg>");
      writeTextFile(join(bundleDirectory, "notes.txt"), "notes");

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

attribute<TemplatePageContextTests>().method((target) => target.date_page_data_and_render_methods_use_typed_context).add(() => new FactAttribute());
attribute<TemplatePageContextTests>().method((target) => target.page_taxonomy_terms_follow_explicit_graph_relations).add(() => new FactAttribute());
attribute<TemplatePageContextTests>().method((target) => target.page_menu_methods_use_the_exact_menu_hierarchy).add(() => new FactAttribute());
attribute<TemplatePageContextTests>().method((target) => target.template_definitions_propagate_across_partial_boundaries).add(() => new FactAttribute());
attribute<TemplatePageContextTests>().method((target) => target.page_resources_use_the_published_bundle_inventory).add(() => new FactAttribute());

attribute<TemplatePageContextTests>().method((target) => target.pagination_uses_exact_integer_ceiling_and_bounded_page_offsets).add(() => new FactAttribute());
attribute<TemplatePageContextTests>().method((target) => target.page_sorts_preserve_ties_and_do_not_mutate_the_source).add(() => new FactAttribute());
