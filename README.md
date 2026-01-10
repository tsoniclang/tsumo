# tsumo
A hugo-inspired blog engine

tsumo is a Hugo-inspired static site generator implemented in TypeScript and compiled to native code with Tsonic (TS → C# → .NET).

## Hugo compatibility (subset)

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Markdown | GitHub Flavored Markdown (GFM) | ✅ | Powered by Markdig (tables, task lists, autolinks, strikethrough, fenced code blocks, etc.) |
| Content | Sections + nested paths | ✅ | `content/posts/series/part-1.md` → `/posts/series/part-1/` |
| Content | Leaf bundles (`index.md`) | ✅ | Copies non-`.md` bundle resources next to the built page |
| Content | Branch bundles (`_index.md`) | ✅ | Home and nested section list pages |
| Front matter | YAML / TOML / JSON | ✅ | `title`, `date`, `draft`, `description`, `slug`, `type`, `layout`, `tags`, `categories`, `params` |
| Taxonomies | `tags` + `categories` | ✅ | Generates `/tags/`, `/tags/<term>/`, `/categories/`, `/categories/<term>/` |
| Templates | Hugo-like Go templates (subset) | ✅ | `baseof`, `block`, `define`, `partial`, `if/else/else if`, `with`, `range` |
| Templates | Common funcs | ✅ | `relURL`, `absURL`, `urlize`, `humanize`, `dateFormat`, `len`, `default`, `printf`, comparisons, boolean ops |
| Outputs | `index.xml`, `sitemap.xml`, `robots.txt` | ✅ | Generated unless you provide your own static files |
| CLI | `build`, `server`, `new site`, `new` | ✅ | `server` supports watch + rebuild |
| Advanced Hugo | Shortcodes, menus, pagination, assets pipeline | ❌ | Intentionally out of scope |

## Repo layout

- `packages/engine` — core build + server engine (Tsonic library)
- `packages/cli` — `tsumo` CLI (Tsonic executable)
- `packages/markdig` — vendored Markdig build + tsbindgen bindings (GFM Markdown)
- `examples/basic-blog` — example site (Hugo-style layout)

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
