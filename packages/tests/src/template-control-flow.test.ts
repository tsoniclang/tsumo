import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import { parseTemplate } from "@tsumo/engine/testing.js";
import { captureDiagnosticCode, render } from "./template-test-harness.js";

export class TemplateControlFlowTests {
  range_bindings_preserve_values_keys_order_and_early_exit(): void {
    Assert.Equal(
      "ab|ab|0:a;1:b;",
      render(
        '{{ range slice "a" "b" }}{{ . }}{{ end }}|' +
        '{{ range $value := slice "a" "b" }}{{ $value }}{{ end }}|' +
        '{{ range $key, $value := slice "a" "b" }}{{ $key }}:{{ $value }};{{ end }}',
      ),
    );
    Assert.Equal(
      "12|12|a:1;b:2;|0:a|empty",
      render(
        '{{ range dict "b" 2 "a" 1 }}{{ . }}{{ end }}|' +
        '{{ range $value := dict "b" 2 "a" 1 }}{{ $value }}{{ end }}|' +
        '{{ range $key, $value := dict "b" 2 "a" 1 }}{{ $key }}:{{ $value }};{{ end }}|' +
        '{{ range $key, $value := slice "a" "b" }}{{ $key }}:{{ $value }}{{ break }}{{ end }}|' +
        '{{ range $key, $value := slice }}unused{{ else }}empty{{ end }}',
      ),
    );
  }

  range_break_and_continue_target_the_innermost_active_range(): void {
    Assert.Equal(
      "134",
      render(
        "{{ range seq 6 }}" +
        "{{ if eq . 2 }}{{ continue }}{{ end }}" +
        "{{ if eq . 5 }}{{ break }}{{ end }}" +
        "{{ . }}{{ end }}",
      ),
    );
    Assert.Equal(
      "1:1;2:1;",
      render(
        "{{ range $outer := seq 2 }}{{$outer}}:" +
        "{{ range seq 3 }}{{ if eq . 2 }}{{ break }}{{ end }}{{ . }}{{ end }};" +
        "{{ end }}",
      ),
    );
    Assert.Equal(
      "1",
      render("{{ range seq 3 }}{{ . }}{{ range (slice) }}x{{ else }}{{ break }}{{ end }}X{{ end }}"),
    );
  }

  parser_rejects_loop_control_without_an_active_range(): void {
    Assert.Equal(
      "TSUMO_TEMPLATE_BREAK_OUTSIDE_RANGE",
      captureDiagnosticCode(() => {
        parseTemplate("{{ break }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_CONTINUE_OUTSIDE_RANGE",
      captureDiagnosticCode(() => {
        parseTemplate("{{ continue }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_LOOP_CONTROL_INVALID",
      captureDiagnosticCode(() => {
        parseTemplate("{{ range seq 1 }}{{ break 1 }}{{ end }}");
      }),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_BREAK_OUTSIDE_RANGE",
      captureDiagnosticCode(() => {
        parseTemplate("{{ range seq 1 }}{{ define \"independent\" }}{{ break }}{{ end }}{{ end }}");
      }),
    );
  }
}

attribute<TemplateControlFlowTests>().method((target) => target.range_break_and_continue_target_the_innermost_active_range).add(() => new FactAttribute());
attribute<TemplateControlFlowTests>().method((target) => target.range_bindings_preserve_values_keys_order_and_early_exit).add(() => new FactAttribute());
attribute<TemplateControlFlowTests>().method((target) => target.parser_rejects_loop_control_without_an_active_range).add(() => new FactAttribute());
