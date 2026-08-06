# Configuration

tsumo reads Hugo-style config files from the site directory. Supported names (first found wins):

1. `hugo.toml`
2. `hugo.yaml`
3. `hugo.yml`
4. `hugo.json`
5. `config.toml`
6. `config.yaml`
7. `config.yml`
8. `config.json`

If no config file exists, tsumo uses defaults (`title = "Tsumo Site"`, `baseURL = ""`, `languageCode = "en-us"`).

Alternatively, `config/_default/` may contain split configuration. Tsumo
accepts at most one base file (`hugo.toml`, `hugo.yaml`, `hugo.yml`,
`config.toml`, `config.yaml`, or `config.yml`), one `params.toml`/YAML file,
one aggregate `languages.toml`, any number of distinct
`languages.<language>.toml` files, distinct `menus.<menu>.toml` files, and one
`module.toml`. They are applied in that order. A language-specific file updates
only the fields it declares and preserves fields from `languages.toml`.
Unsupported files, duplicate case-insensitive filenames, ambiguous base or
params files, directories, symbolic links, and filesystem reparse points fail
before configuration becomes semantic input.

## Supported keys

- `title` (string)
- `baseURL` (string; normalized to have a trailing `/`)
- `languageCode` (string)
- `contentDir` (string; default `content`)
- `theme` (string)
- `copyright` (string)
- `params` (object/table; exposed as `.Site.Params` in templates)
- `menu` (menus; exposed as `.Site.Menus`)

tsumo narrows config data into typed engine models. String, boolean, and
integer-like numeric values are accepted where the schema supports them.
Unknown fields, duplicate fields, malformed syntax, and shape-mismatched values
fail with a `TSUMO_CONFIG_*` diagnostic carrying the configuration path and
source location; they never become open-ended dynamic objects.

### Languages

`languages` is parsed in TOML/JSON configs and used to select a default language/content directory.

Only one language is built per invocation.

## Examples

### `hugo.toml`

```toml
baseURL = "http://localhost:1313/"
languageCode = "en-us"
title = "My Site"
theme = "hugo-book"

[params]
  BookSearch = true

[[menu.main]]
  name = "Home"
  url = "/"
  weight = 1
```

### `hugo.yaml`

```yaml
baseURL: "http://localhost:1313/"
languageCode: "en-us"
title: "My Site"
theme: "hugo-book"
params:
  BookSearch: true
menu:
  main:
    - name: Home
      url: /
      weight: 1
```

### `hugo.json`

```json
{
  "baseURL": "http://localhost:1313/",
  "languageCode": "en-us",
  "title": "My Site",
  "theme": "hugo-book",
  "params": { "BookSearch": true },
  "menu": {
    "main": [{ "name": "Home", "url": "/", "weight": 1 }]
  }
}
```

JSON config files support the documented schema: top-level site keys,
`params`, `languages`, and `menu`. Object keys are matched case-insensitively
for the supported fields.

TOML and YAML use the documented subset shown above: root site fields, scalar
`params`, and menu entries. TOML and JSON additionally support `languages`.
Known string fields reject boolean or integer scalars, integer fields reject
quoted strings, and duplicate keys are rejected case-insensitively. TOML string
values must be quoted; comments in TOML and YAML are recognized without
discarding `#` characters inside quoted strings.
