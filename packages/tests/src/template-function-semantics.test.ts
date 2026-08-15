import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { captureDiagnosticCode, render } from "./template-test-harness.js";

export class TemplateFunctionSemanticsTests {
  template_namespaces_expose_exact_string_and_hugo_functions(): void {
    Assert.Equal("=====", render("{{ strings.Repeat 5 \"=\" }}"));
    Assert.Equal("Hello World", render("{{ strings.Title \"hello world\" }}"));
    Assert.Equal("3|9|4|4|5", render(
      "{{ math.Min 9 3 7 }}|{{ math.Max 9 3 7 }}|{{ math.Round 4 }}|{{ math.Ceil 4 }}|{{ math.Add 2 3 }}",
    ));
    Assert.Equal("c,b,a|a,b", render(
      "{{ delimit (collections.Reverse (slice \"a\" \"b\" \"c\")) `,` }}|{{ delimit (strings.Split \"a,b\" `,`) `,` }}",
    ));
    Assert.Equal("string|bool|int|map[string]interface {}|&quot;quoted&quot;|true|3", render(
      "{{ printf \"%T|%T|%T|%T|%q|%t|%v\" \"value\" true 3 (dict \"key\" \"value\") \"quoted\" true 3 }}",
    ));
    Assert.Equal(
      '<meta name="generator" content="Hugo 0.146.2">',
      render("{{ hugo.Generator }}"),
    );
    Assert.Equal(
      "TSUMO_TEMPLATE_STRING_REPEAT_INVALID",
      captureDiagnosticCode(() => {
        render("{{ strings.Repeat -1 \"=\" }}");
      }),
    );
    Assert.Equal("a,b", render("{{ delimit (collections.First 2 (collections.Slice \"a\" \"b\" \"c\")) \",\" }}"));
    Assert.Equal("fallback", render("{{ compare.Default \"fallback\" \"\" }}"));
    Assert.Equal("false|only|42", render("{{ default \"fallback\" false }}|{{ default \"only\" }}|{{ default 42 0 }}"));
    Assert.Equal("nil", render("{{ if nil }}value{{ else }}nil{{ end }}"));
    Assert.Equal("line", render("{{ chomp \"line\\n\" }}"));
    Assert.Equal("2024", render("{{ now.Year }}"));
    Assert.Equal("configured", render("{{ getenv \"TSUMO_TEST_VALUE\" }}"));
    Assert.Equal("", render("{{ getenv \"TSUMO_MISSING_VALUE\" }}"));
    Assert.Equal("true|false", render("{{ fileExists \"static/existing.css\" }}|{{ fileExists \"static/missing.css\" }}"));
    Assert.Equal("true", render("{{ collections.IsSet (dict \"key\" \"value\") \"key\" }}"));
    Assert.Equal("translated", render("{{ T \"translated\" }}"));
    Assert.Equal("2026|42", render("{{ int \"2026\" }}|{{ string 42 }}"));
    Assert.Equal("true|false", render("{{ collections.In (collections.Slice \"first\" \"second\") \"second\" }}|{{ collections.In (collections.Slice \"first\") \"second\" }}"));
    Assert.Equal("one two|first|one two|url.Values", render(
      "{{ $url := urls.Parse \"/page?classes=one+two&name=first&name=second\" }}" +
      "{{ $url.Query.Get \"classes\" }}|{{ $url.Query.Get \"name\" }}|{{ $url.Query.classes }}|{{ printf \"%T\" $url.Query }}",
    ));
    Assert.Equal("", render("{{ $url := urls.Parse \"/page?name=value\" }}{{ $url.Query.Get \"missing\" }}"));
    Assert.Equal("🙂", render("{{ $url := urls.Parse \"/page?name=%F0%9F%99%82\" }}{{ $url.Query.Get \"name\" }}"));
    Assert.Equal("TSUMO_TEMPLATE_URL_QUERY_INVALID", captureDiagnosticCode(() => {
      render("{{ $url := urls.Parse \"/page?name=%ZZ\" }}{{ $url.Query.Get \"name\" }}");
    }));
    Assert.Equal("TSUMO_TEMPLATE_URL_QUERY_INVALID", captureDiagnosticCode(() => {
      render("{{ $url := urls.Parse \"/page?name=%F0%28%8C%28\" }}{{ $url.Query.Get \"name\" }}");
    }));
    Assert.Equal("value|nested", render(
      "{{ hugo.Store.Set \"name\" \"value\" }}{{ hugo.Store.SetInMap \"items\" \"key\" \"nested\" }}" +
      "{{ hugo.Store.Get \"name\" }}|{{ index (hugo.Store.Get \"items\") \"key\" }}",
    ));
    Assert.Equal("first,second", render("{{ delimit (transform.Unmarshal \"- first\\n- second\") \",\" }}"));
    Assert.Equal("value", render("{{ (transform.Unmarshal \"{\\\"key\\\":\\\"value\\\"}\").key }}"));
    Assert.Equal("_partials/site-style.html", render("{{ fmt.Print \"_partials/\" \"site-style.html\" }}"));
    Assert.Equal("true", render("{{ hasPrefix \"<svg viewBox=0>\" \"<svg\" }}"));
    Assert.Equal("true|true|false", render(
      "{{ reflect.IsMap (dict \"key\" \"value\") }}|{{ reflect.IsSlice (slice \"value\") }}|{{ reflect.IsMap (slice) }}",
    ));
    Assert.Equal("value|true|trimmed", render(
      "{{ strings.ToLower \"VALUE\" }}|{{ strings.HasSuffix \"index.html\" \".html\" }}|{{ strings.Trim \"/trimmed/\" \"/\" }}",
    ));
    Assert.Equal(
      "a%20b=c%2Fd|.css|content/page.md|900150983cd24fb0d6963f7d28e17f72|Hello World|3",
      render(
        "{{ collections.Querify \"a b\" \"c/d\" }}|{{ path.Ext \"assets/main.css\" }}|" +
        "{{ path.Join \"content\" \"posts\" \"..\" \"page.md\" }}|{{ crypto.MD5 \"abc\" }}|" +
        "{{ inflect.Humanize \"hello-world\" }}|{{ math.Ceil 3 }}",
      ),
    );
    Assert.Equal(
      "/asset.css|https://example.test/asset.css|https://example.test/asset.css|&lt;x&gt;",
      render(
        "{{ urls.RelURL \"asset.css\" }}|{{ urls.AbsURL \"/asset.css\" }}|" +
        "{{ urls.AbsLangURL \"/asset.css\" }}|{{ safeHTML (transform.HTMLEscape \"<x>\") }}",
      ),
    );
  }
}

attribute<TemplateFunctionSemanticsTests>().method((target) => target.template_namespaces_expose_exact_string_and_hugo_functions).add(FactAttribute);
