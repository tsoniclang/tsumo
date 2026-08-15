import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import { parseTemplate } from "@tsumo/engine/testing.js";
import { captureDiagnosticCode, render } from "./template-test-harness.js";

export class TemplateControlFlowTests {
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

attribute<TemplateControlFlowTests>().method((target) => target.range_break_and_continue_target_the_innermost_active_range).add(FactAttribute);
attribute<TemplateControlFlowTests>().method((target) => target.parser_rejects_loop_control_without_an_active_range).add(FactAttribute);
