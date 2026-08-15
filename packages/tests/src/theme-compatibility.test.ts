import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";

import {
  DateValue,
  getEmbeddedTemplateSource,
  loadSiteData,
  ModuleMount,
  PageValue,
  parseTemplate,
  ResourceManager,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";
import {
  captureDiagnosticCode,
  createPage,
  createSite,
  render,
  renderWithRoot,
  TestTemplateEnvironment,
} from "./template-test-harness.js";

export class ThemeCompatibilityTests {
  chained_alternatives_preserve_the_selected_context(): void {
    Assert.Equal(
      "second|selected|fallback",
      render(
        "{{ if false }}first{{ else if true }}second{{ else }}third{{ end }}|" +
        "{{ with nil }}first{{ else with \"selected\" }}{{ . }}{{ else }}third{{ end }}|" +
        "{{ with nil }}first{{ else with nil }}second{{ else }}fallback{{ end }}",
      ),
    );
    Assert.Equal(
      "2026-08-15T00:00:00Z|2026-08-15T00:00:00Z",
      renderWithRoot(
        "{{ time . }}|{{ time.AsTime . }}",
        new DateValue("2026-08-15T00:00:00Z"),
      ),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_TIME_INVALID",
      captureDiagnosticCode(() => {
        render("{{ time \"not-a-date\" }}");
      }),
    );
  }

  date_methods_and_unicode_substrings_follow_hugo_semantics(): void {
    Assert.Equal(
      "2024-03-02|true",
      renderWithRoot(
        "{{ (.AddDate 0 1 0).Format \"2006-01-02\" }}|" +
        "{{ (.AddDate 0 0 2).After (.AddDate 0 0 1) }}",
        new DateValue("2024-01-31T00:00:00Z"),
      ),
    );
    Assert.Equal(
      "😀B|ef|bcd|",
      render(
        "{{ substr \"A😀BC\" 1 2 }}|{{ strings.Substr \"abcdef\" -2 }}|" +
        "{{ substr \"abcdef\" 1 -2 }}|{{ substr \"abcdef\" 20 }}",
      ),
    );
    Assert.Equal("1704067200|1704067200000000000", render("{{ now.Unix }}|{{ now.UnixNano }}"));
    Assert.Equal("TSUMO_TEMPLATE_DATE_INVALID", captureDiagnosticCode(() => {
      renderWithRoot("{{ .AddDate 2147483647 0 0 }}", new DateValue("2024-01-31T00:00:00Z"));
    }));
    Assert.Equal("TSUMO_TEMPLATE_DATE_INVALID", captureDiagnosticCode(() => {
      renderWithRoot("{{ .AddDate 0 0 2147483647 }}", new DateValue("2024-01-31T00:00:00Z"));
    }));
    Assert.Equal(
      "TSUMO_TEMPLATE_SUBSTRING_ARGUMENT_INVALID",
      captureDiagnosticCode(() => {
        render("{{ substr \"abc\" \"invalid\" }}");
      }),
    );
  }

  integer_sequences_follow_hugo_semantics_and_limits(): void {
    Assert.Equal(
      "1,2,3,|-2,-1,0,1,2,|6,4,2,|-1,-2,-3,",
      render(
        "{{ range seq 3 }}{{ . }},{{ end }}|" +
        "{{ range collections.Seq -2 2 }}{{ . }},{{ end }}|" +
        "{{ range seq 6 -2 2 }}{{ . }},{{ end }}|" +
        "{{ range seq -3 }}{{ . }},{{ end }}",
      ),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_SEQUENCE_INCREMENT_INVALID",
      captureDiagnosticCode(() => {
        render("{{ seq 1 0 2 }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_SEQUENCE_SIZE_UNSUPPORTED",
      captureDiagnosticCode(() => {
        render("{{ seq -1000001 }}");
      }),
    );
  }

  string_cutset_functions_follow_unicode_semantics(): void {
    Assert.Equal(
      "path😀|😀/path|value|middle",
      render(
        "{{ strings.TrimLeft \"😀/\" \"😀/path😀\" }}|" +
        "{{ strings.TrimRight \"😀/\" \"😀/path😀/\" }}|" +
        "{{ strings.TrimSpace \"\u00a0value\u3000\" }}|" +
        "{{ strings.Trim \"😀/middle/😀\" \"😀/\" }}",
      ),
    );
  }

  where_filters_structured_slices_and_rejects_unproven_inputs(): void {
    Assert.Equal(
      "one,three,|two,",
      render(
        "{{ $items := slice (dict \"kind\" \"x\" \"name\" \"one\") " +
        "(dict \"kind\" \"y\" \"name\" \"two\") (dict \"kind\" \"x\" \"name\" \"three\") }}" +
        "{{ range where $items \"kind\" \"x\" }}{{ .name }},{{ end }}|" +
        "{{ range where $items \"kind\" \"ne\" \"x\" }}{{ .name }},{{ end }}",
      ),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_WHERE_COLLECTION_UNSUPPORTED",
      captureDiagnosticCode(() => {
        render("{{ where \"scalar\" \"\" \"scalar\" }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_WHERE_OPERATOR_UNSUPPORTED",
      captureDiagnosticCode(() => {
        render("{{ where (slice \"value\") \"\" \"approximately\" \"value\" }}");
      }),
    );
  }

  site_data_layers_are_structured_deterministic_and_conflict_checked(): void {
    const root = createTestDirectory("theme-data-layers");
    const siteDirectory = Path.Combine(root, "site");
    const themeDirectory = Path.Combine(root, "theme");
    const mountDirectory = Path.Combine(root, "module-data");
    try {
      Directory.CreateDirectory(Path.Combine(siteDirectory, "data"));
      Directory.CreateDirectory(Path.Combine(themeDirectory, "data", "nested"));
      Directory.CreateDirectory(mountDirectory);
      File.WriteAllText(Path.Combine(themeDirectory, "data", "theme.toml"), "value = \"theme\"\n");
      File.WriteAllText(Path.Combine(themeDirectory, "data", "shared.toml"), "value = \"theme\"\n");
      File.WriteAllText(Path.Combine(themeDirectory, "data", "nested", "entry.json"), "{\"value\":\"nested\"}");
      File.WriteAllText(Path.Combine(mountDirectory, "module.json"), "{\"value\":\"module\"}");
      File.WriteAllText(Path.Combine(mountDirectory, "shared.json"), "{\"value\":\"module\"}");
      File.WriteAllText(Path.Combine(siteDirectory, "data", "site.yaml"), "value: site\n");
      File.WriteAllText(Path.Combine(siteDirectory, "data", "shared.yaml"), "value: site\n");

      const data = loadSiteData(
        siteDirectory,
        themeDirectory,
        [new ModuleMount(mountDirectory, "data")],
      );
      const environment = new TestTemplateEnvironment();
      environment.setSiteData(data);
      const site = createSite();
      const page = createPage(site, "Home", "", "home");
      const template = parseTemplate(
        "{{ hugo.Data.theme.value }}|{{ hugo.Data.module.value }}|" +
        "{{ .Site.Data.shared.value }}|{{ hugo.Data.nested.entry.value }}",
      );
      Assert.Equal(
        "theme|module|site|nested",
        environment.renderTemplate(template, new PageValue(page), site, new Map()),
      );

      File.WriteAllText(Path.Combine(siteDirectory, "data", "shared.toml"), "value = \"duplicate\"\n");
      Assert.Equal(
        "TSUMO_DATA_IDENTITY_CONFLICT",
        captureDiagnosticCode(() => {
          loadSiteData(siteDirectory, themeDirectory, [new ModuleMount(mountDirectory, "data")]);
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  embedded_page_image_partial_selects_published_page_resources(): void {
    const root = createTestDirectory("embedded-page-images");
    const siteDirectory = Path.Combine(root, "site");
    const bundleDirectory = Path.Combine(siteDirectory, "content", "home");
    const outputDirectory = Path.Combine(root, "output");
    try {
      Directory.CreateDirectory(bundleDirectory);
      File.WriteAllText(Path.Combine(bundleDirectory, "cover.svg"), "<svg></svg>");
      const source = getEmbeddedTemplateSource("_partials/_funcs/get-page-images.html");
      if (source === undefined) {
        Assert.True(false);
        return;
      }
      const environment = new TestTemplateEnvironment(
        new ResourceManager(siteDirectory, undefined, outputDirectory),
      );
      environment.templates.set(
        "_partials/_funcs/get-page-images",
        parseTemplate(source, "_partials/_funcs/get-page-images.html"),
      );
      const site = createSite();
      const page = createPage(site, "Home", "", "home");
      page.resourceSourceDir = bundleDirectory;
      Assert.Equal(
        "/home/cover.svg",
        environment.renderTemplate(
          parseTemplate("{{ with index (partial \"_funcs/get-page-images\" .) 0 }}{{ .RelPermalink }}{{ end }}"),
          new PageValue(page),
          site,
          new Map(),
        ),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<ThemeCompatibilityTests>().method((target) => target.chained_alternatives_preserve_the_selected_context).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.date_methods_and_unicode_substrings_follow_hugo_semantics).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.integer_sequences_follow_hugo_semantics_and_limits).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.string_cutset_functions_follow_unicode_semantics).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.where_filters_structured_slices_and_rejects_unproven_inputs).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.site_data_layers_are_structured_deterministic_and_conflict_checked).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.embedded_page_image_partial_selects_published_page_resources).add(FactAttribute);
