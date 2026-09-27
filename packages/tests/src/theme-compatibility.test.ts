import { attribute } from "@tsonic/core/lang.js";
import { join } from "node:path";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import {
  DateValue,
  getEmbeddedTemplateSource,
  loadSiteData,
  ModuleMount,
  PageValue,
  parseTemplate,
  ResourceManager,
} from "@tsumo/engine/testing.js";
import { createDirectory, createTestDirectory, deleteTestDirectory, writeTextFile } from "./test-root.js";
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
    const siteDirectory = join(root, "site");
    const themeDirectory = join(root, "theme");
    const mountDirectory = join(root, "module-data");
    try {
      createDirectory(join(siteDirectory, "data"));
      createDirectory(join(themeDirectory, "data", "nested"));
      createDirectory(mountDirectory);
      writeTextFile(join(themeDirectory, "data", "theme.toml"), "value = \"theme\"\n");
      writeTextFile(join(themeDirectory, "data", "shared.toml"), "value = \"theme\"\n");
      writeTextFile(join(themeDirectory, "data", "nested", "entry.json"), "{\"value\":\"nested\"}");
      writeTextFile(join(mountDirectory, "module.json"), "{\"value\":\"module\"}");
      writeTextFile(join(mountDirectory, "shared.json"), "{\"value\":\"module\"}");
      writeTextFile(join(siteDirectory, "data", "site.yaml"), "value: site\n");
      writeTextFile(join(siteDirectory, "data", "shared.yaml"), "value: site\n");

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

      writeTextFile(join(siteDirectory, "data", "shared.toml"), "value = \"duplicate\"\n");
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
    const siteDirectory = join(root, "site");
    const bundleDirectory = join(siteDirectory, "content", "home");
    const outputDirectory = join(root, "output");
    try {
      createDirectory(bundleDirectory);
      writeTextFile(join(bundleDirectory, "cover.svg"), "<svg></svg>");
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

attribute<ThemeCompatibilityTests>().method((target) => target.chained_alternatives_preserve_the_selected_context).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.date_methods_and_unicode_substrings_follow_hugo_semantics).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.integer_sequences_follow_hugo_semantics_and_limits).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.string_cutset_functions_follow_unicode_semantics).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.where_filters_structured_slices_and_rejects_unproven_inputs).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.site_data_layers_are_structured_deterministic_and_conflict_checked).add(() => new FactAttribute());
attribute<ThemeCompatibilityTests>().method((target) => target.embedded_page_image_partial_selects_published_page_resources).add(() => new FactAttribute());
