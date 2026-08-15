import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";

import {
  DateValue,
  loadSiteData,
  ModuleMount,
  PageValue,
  parseTemplate,
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
}

attribute<ThemeCompatibilityTests>().method((target) => target.chained_alternatives_preserve_the_selected_context).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.where_filters_structured_slices_and_rejects_unproven_inputs).add(FactAttribute);
attribute<ThemeCompatibilityTests>().method((target) => target.site_data_layers_are_structured_deterministic_and_conflict_checked).add(FactAttribute);
