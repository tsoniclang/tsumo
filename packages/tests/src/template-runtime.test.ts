import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";

import {
  DictValue,
  PageContext,
  parseShortcodes,
  parseTemplate,
  RenderScope,
  SiteConfig,
  SiteContext,
  StringValue,
  Template,
  TemplateEnvironment,
  TemplateValue,
  TsumoError,
} from "@tsumo/engine/testing.js";

class TestTemplateEnvironment extends TemplateEnvironment {
  getTemplate(_path: string): Template | undefined {
    return undefined;
  }
}

const createSite = (): SiteContext => {
  const config = new SiteConfig("Test Site", "https://example.test/", "en", undefined, undefined);
  const pages: PageContext[] = [];
  return new SiteContext(config, pages, undefined, undefined);
};

const renderWithRoot = (source: string, root: TemplateValue): string => {
  const template = parseTemplate(source);
  const environment = new TestTemplateEnvironment();
  const site = createSite();
  const scope = new RenderScope(root, root, site, environment, undefined);
  const output = new StringBuilder();
  template.renderInto(output, scope, environment, new Map());
  return output.ToString();
};

const render = (source: string): string =>
  renderWithRoot(source, new DictValue(new Map<string, TemplateValue>()));

const captureDiagnosticCode = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a TsumoError diagnostic");
};

const captureDiagnostic = (operation: () => void): TsumoError => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error;
    throw error;
  }
  throw new Exception("Expected a TsumoError diagnostic");
};

export class TemplateRuntimeTests {
  parser_and_evaluator_render_control_flow_and_pipeline(): void {
    const source = "{{ if true }}yes{{ else }}no{{ end }}|{{ \"ab\" | upper }}";
    Assert.Equal("yes|AB", render(source));
  }

  collection_functions_preserve_exact_split_segments(): void {
    Assert.Equal("a|b|", render("{{ delimit (split \"a--b--\" \"--\") \"|\" }}"));
    Assert.Equal("a|b", render("{{ delimit (split \"ab\" \"\") \"|\" }}"));
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
  }

  dictionary_values_are_resolved_without_name_fallbacks(): void {
    const values = new Map<string, TemplateValue>();
    values.set("message", new StringValue("exact"));
    Assert.Equal("exact", renderWithRoot("{{ .message }}", new DictValue(values)));
  }
}

attribute<TemplateRuntimeTests>().method((target) => target.parser_and_evaluator_render_control_flow_and_pipeline).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.collection_functions_preserve_exact_split_segments).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.dictionary_range_order_is_deterministic).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.parser_reports_exact_malformed_input_diagnostics).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.shortcode_parser_rejects_ambiguous_input_with_exact_locations).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.evaluator_reports_exact_unknown_and_invalid_operations).add(FactAttribute);
attribute<TemplateRuntimeTests>().method((target) => target.dictionary_values_are_resolved_without_name_fallbacks).add(FactAttribute);
