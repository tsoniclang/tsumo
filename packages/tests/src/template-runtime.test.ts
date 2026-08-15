import { attribute } from "@tsonic/core/lang.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import {
  collectShortcodeNames,
  DictValue,
  I18nStore,
  PageValue,
  parseShortcodes,
  parseTemplate,
  ResourceManager,
  StringValue,
  TemplateValue,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";
import {
  captureDiagnostic, captureDiagnosticCode, createPage, createSite, render, renderWithRoot,
  TestTemplateEnvironment,
} from "./template-test-harness.js";

export class TemplateRuntimeTests {
  parser_and_evaluator_render_control_flow_and_pipeline(): void {
    const source = "{{ if true }}yes{{ else }}no{{ end }}|{{ \"ab\" | upper }}";
    Assert.Equal("yes|AB", render(source));
    const site = createSite();
    const page = createPage(site, "Home", "", "home");
    Assert.Equal(
      "false|exact",
      renderWithRoot(
        "{{ in (slice \"posts\" \"tags\") .Section }}|{{ (dict \"value\" \"exact\").value }}",
        new PageValue(page),
      ),
    );
    Assert.Equal(
      "inner|outer|empty|chosen:chosen|changed|changed",
      render(
        "{{ $value := \"outer\" }}" +
        "{{ if $value := \"inner\" }}{{ $value }}{{ end }}|{{ $value }}|" +
        "{{ with $selected := \"\" }}invalid{{ else }}{{ if eq $selected \"\" }}empty{{ end }}{{ end }}|" +
        "{{ with $selected := \"chosen\" }}{{ $selected }}:{{ . }}{{ end }}|" +
        "{{ if $value = \"changed\" }}{{ $value }}{{ end }}|{{ $value }}",
      ),
    );
  }

  collection_functions_preserve_exact_split_segments(): void {
    Assert.Equal("a|b|", render("{{ delimit (split \"a--b--\" \"--\") \"|\" }}"));
    Assert.Equal("a|b", render("{{ delimit (split \"ab\" \"\") \"|\" }}"));
  }

  collection_union_accepts_slices_and_nil_without_collapsing_distinct_values(): void {
    Assert.Equal(
      "a,b,c|a,b|a,b|",
      render(
        "{{ delimit (union (slice \"a\" \"b\") (slice \"b\" \"c\")) \",\" }}|" +
        "{{ delimit (union (slice \"a\" \"b\") nil) \",\" }}|" +
        "{{ delimit (union nil (slice \"a\" \"b\")) \",\" }}|" +
        "{{ delimit (union nil nil) \",\" }}",
      ),
    );
    Assert.Equal(
      "one,three",
      render("{{ delimit (collections.Complement (slice \"two\") (slice \"one\" \"two\" \"three\")) \",\" }}"),
    );
  }

  page_has_shortcode_uses_the_exact_parsed_page_inventory(): void {
    const site = createSite();
    const page = createPage(site, "Home", "", "home");
    page.shortcodeNames = collectShortcodeNames(
      "{{< outer >}}{{< inner / >}}{{< /outer >}}\n```text\n{{< ignored >}}\n```",
      "content/home.md",
    );
    Assert.Equal(
      "true|true|false|false",
      renderWithRoot(
        "{{ .HasShortcode \"outer\" }}|{{ .HasShortcode \"inner\" }}|" +
        "{{ .HasShortcode \"ignored\" }}|{{ .HasShortcode \"Outer\" }}",
        new PageValue(page),
      ),
    );
  }


  hugo_sites_exposes_the_checked_site_graph(): void {
    const environment = new TestTemplateEnvironment();
    const site = createSite();
    const root = createPage(site, "Home", "", "home");
    site.home = root;
    site.Sites = [site];
    const template = parseTemplate(
      "{{ range hugo.Sites }}{{ .Title }};{{ end }}|{{ hugo.Sites.Default.Home.RelPermalink }}",
    );
    Assert.Equal(
      "Test Site;|/home/",
      environment.renderTemplate(template, new PageValue(root), site, new Map()),
    );
  }

  related_pages_use_exact_default_keyword_and_tag_evidence(): void {
    const environment = new TestTemplateEnvironment();
    const site = createSite();
    const current = createPage(site, "Current", "2026-08-15T00:00:00Z", "page");
    const older = createPage(site, "Older", "2025-08-15T00:00:00Z", "page");
    const newer = createPage(site, "Newer", "2027-08-15T00:00:00Z", "page");
    const unrelated = createPage(site, "Unrelated", "2024-08-15T00:00:00Z", "page");
    current.tags = ["shared"];
    older.tags = ["shared"];
    newer.tags = ["shared"];
    unrelated.tags = ["other"];
    site.allPages = [current, older, newer, unrelated];
    const template = parseTemplate("{{ range site.RegularPages.Related page }}{{ .Title }}{{ end }}");
    Assert.Equal(
      "Older",
      environment.renderTemplate(template, new PageValue(current), site, new Map()),
    );
  }

  css_build_applies_its_closed_resource_options(): void {
    const root = createTestDirectory("template-css-build");
    const siteDirectory = Path.Combine(root, "site");
    const outputDirectory = Path.Combine(root, "output");
    try {
      Directory.CreateDirectory(siteDirectory);
      const manager = new ResourceManager(siteDirectory, undefined, outputDirectory);
      const environment = new TestTemplateEnvironment(manager);
      const site = createSite();
      const page = createPage(site, "Home", "", "home");
      const template = parseTemplate(
        "{{ $style := resources.FromString \"theme.css\" \"body { color: red; }\\n\" }}" +
        "{{ $style = $style | css.Build (dict \"targetPath\" \"css/main.css\" \"minify\" true \"sourceMap\" \"none\") }}" +
        "{{ $style.RelPermalink }}|{{ $style.Content }}",
      );
      Assert.Equal(
        "/css/main.css|body { color: red; }",
        environment.renderTemplate(template, new PageValue(page), site, new Map()),
      );
      const namespaceTemplate = parseTemplate(
        "{{ $namespace := resources }}" +
        "{{ $copy := $namespace.FromString \"css/copy.css\" \"p { color: blue; }\" }}" +
        "{{ $copy.RelPermalink }}|{{ $copy.Content }}",
      );
      Assert.Equal(
        "/css/copy.css|p { color: blue; }",
        environment.renderTemplate(namespaceTemplate, new PageValue(page), site, new Map()),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  i18n_layers_parse_structured_formats_and_render_plural_context(): void {
    const root = createTestDirectory("template-i18n");
    const themeDirectory = Path.Combine(root, "theme");
    const siteDirectory = Path.Combine(root, "site");
    try {
      Directory.CreateDirectory(themeDirectory);
      Directory.CreateDirectory(siteDirectory);
      File.WriteAllText(
        Path.Combine(themeDirectory, "en.toml"),
        "toggleMenu = \"Theme Menu\"\n" +
        "[footer]\n" +
        "builtWith = \"Built with {{ .Generator }}\"\n" +
        "[list.page]\n" +
        "one = \"{{ .Count }} page\"\n" +
        "other = \"{{ .Count }} pages\"\n",
      );
      File.WriteAllText(
        Path.Combine(themeDirectory, "fr.json"),
        "{\"local\":\"Locale française\"}",
      );
      File.WriteAllText(
        Path.Combine(siteDirectory, "en.yaml"),
        "- id: toggleMenu # site override\n" +
        "  translation: Site Menu\n" +
        "- id: legacy\n" +
        "  translation: Legacy {{ .Name }}\n" +
        "- id: continued\n" +
        "  translation:\n" +
        "    \"Continued scalar\"\n" +
        "- id: folded\n" +
        "  translation: >-\n" +
        "    Folded\n" +
        "    scalar\n" +
        "- id: literal\n" +
        "  translation: |\n" +
        "    Literal\n" +
        "    scalar\n" +
        "- id: escapedQuoted\n" +
        "  translation:\n" +
        "    \"Generated with " + "\\" + "\n" +
        "    exact continuity.\"\n" +
        "- id: foldedQuoted\n" +
        "  translation: \"Folded\n" +
        "  quoted scalar\"\n" +
        "- id: singleQuoted\n" +
        "  translation:\n" +
        "    'Single\n" +
        "    quoted ''value'''\n" +
        "- id: plainWithQuotes\n" +
        "  translation: Tagged '{{ . }}'\n",
      );

      const store = new I18nStore();
      store.loadFromDir(themeDirectory);
      store.loadFromDir(siteDirectory);
      Assert.Equal("Site Menu", store.translate("en-US", "toggleMenu"));
      Assert.Equal("{{ .Count }} page", store.translate("en", "list.page", 1));
      Assert.Equal("{{ .Count }} pages", store.translate("en", "list.page", 2));
      Assert.Equal("Locale française", store.translate("fr-FR", "local"));
      Assert.Equal("Folded scalar", store.translate("en", "folded"));
      Assert.Equal("Literal\nscalar\n", store.translate("en", "literal"));
      Assert.Equal("Generated with exact continuity.", store.translate("en", "escapedQuoted"));
      Assert.Equal("Folded quoted scalar", store.translate("en", "foldedQuoted"));
      Assert.Equal("Single quoted 'value'", store.translate("en", "singleQuoted"));
      Assert.Equal("Tagged '{{ . }}'", store.translate("en", "plainWithQuotes"));

      const environment = new TestTemplateEnvironment();
      environment.i18nStore = store;
      const site = createSite();
      const page = createPage(site, "Home", "", "home");
      const template = parseTemplate(
        "{{ T \"toggleMenu\" }}|" +
        "{{ T \"footer.builtWith\" (dict \"Generator\" \"<strong>Tsumo</strong>\") | safeHTML }}|" +
        "{{ T \"list.page\" 1 }}|{{ T \"list.page\" 2 }}|" +
        "{{ T \"legacy\" (dict \"Name\" \"Ada\") }}|{{ T \"continued\" }}",
      );
      Assert.Equal(
        "Site Menu|Built with <strong>Tsumo</strong>|1 page|2 pages|Legacy Ada|Continued scalar",
        environment.renderTemplate(template, new PageValue(page), site, new Map()),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  deferred_templates_finalize_after_normal_render_and_share_keyed_results(): void {
    const environment = new TestTemplateEnvironment();
    const site = createSite();
    const page = createPage(site, "Home", "", "home");
    const template = parseTemplate(
      "{{ with (templates.Defer (dict \"key\" \"shared\")) }}" +
      "{{ site.Store.Add \"runs\" 1 }}{{ site.Store.Get \"late\" }}{{ end }}" +
      "{{ site.Store.Set \"late\" \"ready\" }}",
      "layouts/baseof.html",
    );
    let first = environment.renderTemplate(template, new PageValue(page), site, new Map());
    let second = environment.renderTemplate(template, new PageValue(page), site, new Map());
    const results = environment.finalizeDeferredTemplates();
    for (const token of results.keys()) {
      const result = results.get(token);
      if (result === undefined) throw new Exception("Expected a finalized deferred-template result");
      first = first.replaceAll(token, result);
      second = second.replaceAll(token, result);
    }
    Assert.Equal("ready", first);
    Assert.Equal("ready", second);
    Assert.Equal(
      "1",
      environment.renderTemplate(parseTemplate("{{ site.Store.Get \"runs\" }}"), new PageValue(page), site, new Map()),
    );
  }

  deferred_templates_distinguish_authored_occurrences_with_the_same_key(): void {
    const environment = new TestTemplateEnvironment();
    const site = createSite();
    const page = createPage(site, "Home", "", "home");
    const template = parseTemplate(
      "{{ with (templates.Defer (dict \"key\" \"shared\")) }}first{{ end }}|" +
      "{{ with (templates.Defer (dict \"key\" \"shared\")) }}second{{ end }}",
      "layouts/distinct-deferred.html",
    );
    let output = environment.renderTemplate(template, new PageValue(page), site, new Map());
    const results = environment.finalizeDeferredTemplates();
    Assert.Equal(2, results.size);
    for (const token of results.keys()) {
      const result = results.get(token);
      if (result === undefined) throw new Exception("Expected a finalized deferred-template result");
      output = output.replaceAll(token, result);
    }
    Assert.Equal("first|second", output);
  }

  return_evaluates_its_complete_value_expression(): void {
    const environment = new TestTemplateEnvironment();
    environment.templates.set(
      "partials/selection",
      parseTemplate("{{ return cond true \"selected\" \"rejected\" }}", "partials/selection"),
    );
    const site = createSite();
    const root = createPage(site, "Home", "", "home");
    const parent = parseTemplate("{{ partial \"selection\" . }}", "partials/parent");
    Assert.Equal(
      "selected",
      environment.renderTemplate(parent, new PageValue(root), site, new Map()),
    );
  }

  template_string_literals_decode_exact_interpreted_and_raw_forms(): void {
    Assert.Equal("line\nnext", render("{{ print \"line\\nnext\" }}"));
    Assert.Equal("line\\nnext", render("{{ print `line\\nnext` }}"));
    Assert.Equal("\u001b", render("{{ print \"\\033\" }}"));
    Assert.Equal("🔗", render("{{ print \"\\U0001F517\" }}"));
    Assert.Equal(
      "TSUMO_TEMPLATE_STRING_ESCAPE_INVALID",
      captureDiagnostic(() => {
        render("{{ print \"\\q\" }}");
      }).diagnostic.code,
    );
  }

  template_text_compatibility_functions_are_deterministic(): void {
    Assert.Equal("a-b---c", render("{{ anchorize \"a b   c\" }}"));
    Assert.Equal("-a-b--c-", render("{{ anchorize \"< a, b, & c >\" }}"));
    Assert.Equal("maingo|hugö", render("{{ anchorize \"main.go\" }}|{{ anchorize \"Hugö\" }}"));
    Assert.Equal("I ❤️ Tsumo :unknown:", render("{{ emojify \"I :heart: Tsumo :unknown:\" }}"));
  }

  template_regular_expression_functions_preserve_matches_groups_and_limits(): void {
    Assert.Equal("ab,ac", render("{{ delimit (findRE `a.` `ab ac ad` 2) `,` }}"));
    Assert.Equal(
      "item42|item|42|item|42",
      render(
        "{{ range findRESubmatch `([a-z]+)([0-9]+)` `item42` }}" +
        "{{ delimit . `|` }}|{{ index . 1 }}|{{ index . 2 }}{{ end }}",
      ),
    );
    Assert.Equal("x2 item3", render("{{ replaceRE `item` `x` `item2 item3` 1 }}"));
  }

  template_scanning_preserves_unicode_scalars_and_utf16_locations(): void {
    Assert.Equal("before 🔗 after", render("before 🔗 after"));
    Assert.Equal("🔗", render("{{ print \"🔗\" }}"));
    Assert.Equal("🔗", render("{{ \"<span>🔗</span>\" | plainify }}"));

    const located = captureDiagnostic(() => {
      parseTemplate("🔗{{ if true", "layouts/unicode.html");
    }).diagnostic;
    Assert.Equal("TSUMO_TEMPLATE_ACTION_UNCLOSED", located.code);
    Assert.Equal(1, located.line);
    Assert.Equal(3, located.column);

    const largeTemplateLines: string[] = [];
    for (let index = 0; index < 2000; index++) {
      largeTemplateLines.push(`line ${index}: {{ print \"${index}\" }}`);
    }
    Assert.True(parseTemplate(largeTemplateLines.join("\n"), "layouts/large.html") !== undefined);
  }

  dictionary_range_order_is_deterministic(): void {
    const source = "{{ range $key, $value := dict \"z\" \"last\" \"a\" \"first\" }}{{$key}}={{$value}};{{end}}";
    Assert.Equal("a=first;z=last;", render(source));
    Assert.Equal("a=first;z=last;", render(source));
  }

  parser_reports_exact_malformed_input_diagnostics(): void {
    Assert.Equal(
      "TSUMO_TEMPLATE_ACTION_UNCLOSED",
      captureDiagnosticCode(() => {
        parseTemplate("before {{ if true");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_STRING_UNCLOSED",
      captureDiagnosticCode(() => {
        parseTemplate("{{ print \"unterminated }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_BLOCK_UNCLOSED",
      captureDiagnosticCode(() => {
        parseTemplate("{{ if true }}body");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_DEFINE_DUPLICATE",
      captureDiagnosticCode(() => {
        parseTemplate("{{ define \"x\" }}a{{ end }}{{ define \"x\" }}b{{ end }}");
      }),
    );

    const located = captureDiagnostic(() => {
      parseTemplate("first\n{{ if true", "layouts/single.html");
    }).diagnostic;
    Assert.Equal("TSUMO_TEMPLATE_ACTION_UNCLOSED", located.code);
    Assert.Equal("layouts/single.html", located.file);
    Assert.Equal(2, located.line);
    Assert.Equal(1, located.column);
  }

  shortcode_parser_rejects_ambiguous_input_with_exact_locations(): void {
    const unclosed = captureDiagnostic(() => {
      parseShortcodes("first\n{{< figure", "content/post.md");
    }).diagnostic;
    Assert.Equal("TSUMO_SHORTCODE_ACTION_UNCLOSED", unclosed.code);
    Assert.Equal("content/post.md", unclosed.file);
    Assert.Equal(2, unclosed.line);
    Assert.Equal(1, unclosed.column);

    Assert.Equal(
      "TSUMO_SHORTCODE_PARAMETER_DUPLICATE",
      captureDiagnosticCode(() => {
        parseShortcodes("{{< figure src='one' src='two' >}}", "content/post.md");
      }),
    );
    Assert.Equal(
      "TSUMO_SHORTCODE_PARAMETER_STYLE_MIXED",
      captureDiagnosticCode(() => {
        parseShortcodes("{{< figure 'one' src='two' >}}", "content/post.md");
      }),
    );

    const quoted = parseShortcodes("{{< figure caption=\"\" published=\"true\" count=2 >}}", "content/post.md");
    Assert.Equal(1, quoted.length);
    Assert.Equal("", quoted[0]!.params.get("caption")?.stringValue);
    Assert.Equal("true", quoted[0]!.params.get("published")?.stringValue);
    Assert.Equal(2, quoted[0]!.params.get("count")?.numberValue);
  }

  evaluator_reports_exact_unknown_and_invalid_operations(): void {
    Assert.Equal(
      "TSUMO_TEMPLATE_UNKNOWN_FUNCTION",
      captureDiagnosticCode(() => {
        render("{{ imaginary \"x\" }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_FUNCTION_ARGUMENTS_INVALID",
      captureDiagnosticCode(() => {
        render("{{ div 1 }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_DIVIDE_BY_ZERO",
      captureDiagnosticCode(() => {
        render("{{ div 4 0 }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_MODULO_BY_ZERO",
      captureDiagnosticCode(() => {
        render("{{ mod 4 0 }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_PARTIAL_MISSING",
      captureDiagnosticCode(() => {
        render("{{ partial \"absent\" . }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_METHOD_UNKNOWN",
      captureDiagnosticCode(() => {
        render("{{ (\"value\").Missing \"argument\" }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_METHOD_UNKNOWN",
      captureDiagnosticCode(() => {
        render("{{ $value := slice \"item\" }}{{ $value.Missing \"argument\" }}");
      }),
    );
  }

  dictionary_values_are_resolved_without_name_fallbacks(): void {
    const values = new Map<string, TemplateValue>();
    values.set("message", new StringValue("exact"));
    Assert.Equal("exact", renderWithRoot("{{ .message }}", new DictValue(values)));
  }
}

attribute<TemplateRuntimeTests>().method((target) => target.parser_and_evaluator_render_control_flow_and_pipeline).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.collection_functions_preserve_exact_split_segments).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.collection_union_accepts_slices_and_nil_without_collapsing_distinct_values).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.page_has_shortcode_uses_the_exact_parsed_page_inventory).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.return_evaluates_its_complete_value_expression).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.hugo_sites_exposes_the_checked_site_graph).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.related_pages_use_exact_default_keyword_and_tag_evidence).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.css_build_applies_its_closed_resource_options).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.i18n_layers_parse_structured_formats_and_render_plural_context).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.deferred_templates_finalize_after_normal_render_and_share_keyed_results).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.deferred_templates_distinguish_authored_occurrences_with_the_same_key).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.template_string_literals_decode_exact_interpreted_and_raw_forms).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.template_text_compatibility_functions_are_deterministic).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.template_regular_expression_functions_preserve_matches_groups_and_limits).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.template_scanning_preserves_unicode_scalars_and_utf16_locations).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.dictionary_range_order_is_deterministic).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.parser_reports_exact_malformed_input_diagnostics).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.shortcode_parser_rejects_ambiguous_input_with_exact_locations).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.evaluator_reports_exact_unknown_and_invalid_operations).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.dictionary_values_are_resolved_without_name_fallbacks).add(FactAttribute);
