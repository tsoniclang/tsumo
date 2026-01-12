# Templates

tsumo implements a practical subset of Hugo’s Go templates.

## Template directories

- Site templates: `layouts/`
- Theme templates: `themes/<theme>/layouts/` (or `<themesDir>/<theme>/layouts/`)

## Syntax

- Actions use `{{ ... }}`.
- Whitespace trim is supported with `{{- ... -}}`.
- Pipelines work like Hugo: `{{ .Title | lower | safeHTML }}`.

Supported control structures:

- `if`, `else`, `else if`
- `with`
- `range`
- `define`, `block`, `template`
- `partial`, `partialCached`

## Core values

Common page fields:

- `.Title`, `.Content`, `.Summary`, `.Plain`
- `.Date`, `.Lastmod`
- `.RelPermalink`, `.Permalink`
- `.Section`, `.Type`, `.Kind`
- `.Pages` (for list pages), `.Parent`, `.Ancestors`
- `.Params`, `.Tags`, `.Categories`
- `.TableOfContents`
- `.Resources` (page bundle resources)
- `.Store` (scratch store)

Common site fields:

- `.Site.Title`, `.Site.BaseURL`, `.Site.LanguageCode`
- `.Site.Params`, `.Site.Menus`
- `.Site.Pages`, `.Site.AllPages`
- `.Site.Taxonomies`
- `.Site.OutputFormats`
- `.Site.Store` (scratch store)

## Template lookup (overview)

tsumo does not implement Hugo’s full template lookup order, but supports the common shapes:

- Default templates under `layouts/_default/`:
  - `baseof.html`
  - `single.html`
  - `list.html`
  - `taxonomy.html`
  - `terms.html`
- Section/type overrides under `layouts/<section>/` or `layouts/<type>/`.
- Home page prefers `layouts/index.html` if present.

Docs mode uses:

- `layouts/docs/home.html`, `layouts/docs/list.html`, `layouts/docs/single.html` (if present)

## Render hooks and shortcodes

- Render hooks are loaded from `layouts/_markup/*.html` and `layouts/_default/_markup/*.html` (site or theme).
- Shortcodes are loaded from `layouts/shortcodes/<name>.html` and `layouts/_shortcodes/<name>.html` (site or theme).

