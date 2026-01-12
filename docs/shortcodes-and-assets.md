# Shortcodes and assets

## Shortcodes

tsumo supports both Hugo shortcode forms:

- `{{< ... >}}` (“HTML shortcodes”) — evaluated after markdown rendering
- `{{% ... %}}` (“Markdown shortcodes”) — evaluated before markdown rendering

Shortcode templates are resolved like Hugo:

- `layouts/shortcodes/<name>.html`
- `layouts/_shortcodes/<name>.html`
- and the same under the active theme

### Params

Shortcodes support:

- named params: `{{< figure src="a.png" caption="..." >}}`
- positional params: `{{< figure "a.png" "..." >}}`

## Assets pipeline (Hugo-like subset)

Themes commonly use Hugo’s assets pipeline (`resources.*`, `css.Sass`, fingerprinting). tsumo supports a working subset:

- `resources.Get "path"` (from `assets/`)
- `resources.GetMatch "glob"`
- `resources.FromString "name" "content"`
- `resources.ExecuteAsTemplate "outName" <ctx>` (expects a `Resource` piped into it)
- `resources.Minify` (best-effort)
- `resources.Fingerprint` (adds a content hash to the output path and populates `.Data.Integrity`)
- `css.Sass` (requires a Sass executable)

### Sass compiler

tsumo executes an external Sass compiler.

- Install Dart Sass (`sass` CLI), or set `TSUMO_SASS` to the full path of a Sass executable.

