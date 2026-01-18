# tsumo
A Hugo-inspired static site generator.

tsumo is implemented in TypeScript and compiled to native code with Tsonic (TS → C# → .NET).

## Documentation

- `docs/README.md` — end-user docs (getting started, CLI, config, templates, docs mode)
- `examples/basic-blog/README.md` — minimal blog example
- `examples/docs-site/README.md` — multi-repo docs example (mounts + nav + search)

## Hugo compatibility (subset)

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Markdown | GitHub Flavored Markdown (GFM) | ✅ | Powered by Markdig (GitHub heading IDs, tables, task lists, autolinks, fenced code blocks, etc.) |
| Content | Sections + nested paths | ✅ | `content/posts/series/part-1.md` → `/posts/series/part-1/` |
| Content | Leaf bundles (`index.md`) | ✅ | Copies non-`.md` bundle resources next to the built page |
| Content | Branch bundles (`_index.md`) | ✅ | Home and nested section list pages |
| Front matter | YAML / TOML / JSON | ✅ | `title`, `date`, `draft`, `description`, `slug`, `type`, `layout`, `tags`, `categories`, `params` |
| Taxonomies | `tags` + `categories` | ✅ | Generates terms + term pages |
| Templates | Hugo-like Go templates (subset) | ✅ | `baseof`, `block`, `define`, `partial`, `if/else/else if`, `with`, `range`, `template` |
| Templates | Render hooks | ✅ | `layouts/_markup/*.html` + `layouts/_default/_markup/*.html` |
| Shortcodes | `{{< >}}` + `{{% %}}` | ✅ | Loaded from `layouts/shortcodes/` + `layouts/_shortcodes/` |
| Menus | Config + front matter menus | ✅ | Merged + hierarchical (`parent`, `weight`) |
| Assets | Hugo-like pipeline (subset) | ✅ | `resources.*`, `css.Sass`, `Fingerprint`, `ExecuteAsTemplate` (Sass requires `TSUMO_SASS`/`sass`) |
| Outputs | `index.xml`, `sitemap.xml`, `robots.txt` | ✅ | Generated unless you provide your own static files |
| CLI | `build`, `server`, `new site`, `new` | ✅ | `server` supports watch + rebuild |
| Docs | Multi-repo mounts + nav + search | ✅ | Enabled by `tsumo.docs.json` (tsumo-specific) |
| Advanced Hugo | Multilingual builds, pagination | ❌ | Not implemented |

## Repo layout

- `packages/engine` — core build + server engine (Tsonic library)
- `packages/cli` — `tsumo` CLI (Tsonic executable)
- `packages/markdig` — vendored Markdig build (GFM Markdown)
- `examples/basic-blog` — example site (Hugo-style layout)
- `examples/docs-site` — docs-mode example (mounts + nav + search)

## Build

```bash
npm install
npm run build
```

## Try the example

```bash
# Build the example site into examples/basic-blog/public
./packages/cli/out/tsumo build --source ./examples/basic-blog

# Dev server (watch + rebuild)
./packages/cli/out/tsumo server --source ./examples/basic-blog
```

## Commands

- `tsumo new site <dir>` — scaffold a new site
- `tsumo new <path.md> [--source <dir>]` — create new content under `content/`
- `tsumo build [--source <dir>]` — build site into `public/`
- `tsumo server [--source <dir>]` — serve `public/` (watch + rebuild by default)

## Native AOT (optional)

```bash
npm run -w tsumo-cli build:aot
./packages/cli/out/tsumo-aot --help
```
