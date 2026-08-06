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

## Data model

tsumo parses configuration, front matter, docs manifests, template contexts, and
resource metadata into closed engine models. JSON input is accepted for supported
schemas and then narrowed into typed Tsonic classes before build or template
execution.

This keeps generated native code deterministic while preserving Hugo-style
authoring for normal site content.

## Repo layout

- `packages/engine` — core build + server engine (Tsonic source package, user-owned `Tsumo.Engine.csproj`)
- `packages/cli` — `tsumo` CLI (Tsonic executable, user-owned `Tsumo.Cli.csproj` with NativeAOT publish)
- `packages/tests` — Tsonic-authored xUnit tests (user-owned `Tsumo.Tests.csproj`)
- `packages/markdig` — vendored Markdig source build (GFM Markdown; provider + target reference)
- `examples/basic-blog` — example site (Hugo-style layout)
- `examples/docs-site` — docs-mode example (mounts + nav + search)

## Coding standards

See `CODING-STANDARDS.md`.

## Build

```bash
npm install
npm run build
```

`npm run build` runs three ordered stages:

1. `prepare:provider-references` — builds the vendored Markdig assembly and
   materializes the locked NuGet compile closure (PhotoSauce + codecs) into
   an immutable `.temp/provider-reference-snapshots/*/product` directory and
   atomically selects it through `.temp/active-provider-references`; these
   exact assemblies are both the Tsonic
   provider reflection input and the `.csproj` compile references.
2. `build:tsonic` — `tsonic build` for the engine, CLI, and tests projects.
   Tsonic emits C# source only into each package's ignored `out/csharp/`;
   the user-owned `.csproj` files are never generated or modified.
3. `build:dotnet` — `dotnet build` for the user-owned projects.

Sibling checkouts are installed via `file:` dependencies (`../tsonic`,
`../tsonic-csharp`, `../csharp-runtime`, `../csharp-js`, `../csharp-nodejs`).

## Tests

```bash
npm run test:dotnet   # Tsonic-authored xUnit tests through dotnet test
npm test              # Node-driven end-to-end CLI/fixture tests
```

## Try the example

```bash
# Build the example site into examples/basic-blog/public
dotnet run --project packages/cli/Tsumo.Cli.csproj -- build --source ./examples/basic-blog

# Dev server (watch + rebuild)
dotnet run --project packages/cli/Tsumo.Cli.csproj -- server --source ./examples/basic-blog
```

## Commands

- `tsumo new site <dir>` — scaffold a new site
- `tsumo new <path.md> [--source <dir>]` — create new content under `content/`
- `tsumo build [--source <dir>]` — build site into `public/`
- `tsumo server [--source <dir>]` — serve `public/` (watch + rebuild by default)

## Native AOT

```bash
npm run -w tsumo-cli publish:aot
./packages/cli/bin/Release/net10.0/linux-x64/publish/tsumo --help
```
