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

## Supported keys

- `title` (string)
- `baseURL` (string; normalized to have a trailing `/`)
- `languageCode` (string)
- `contentDir` (string; default `content`)
- `theme` (string)
- `copyright` (string)
- `params` (object/table; exposed as `.Site.Params` in templates)
- `menu` (menus; exposed as `.Site.Menus`)

### Languages (limited)

`languages` is parsed in TOML/JSON configs and used to select a default language/content directory.

Current limitation: multi-language builds are not implemented yet (only one language is built).

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

