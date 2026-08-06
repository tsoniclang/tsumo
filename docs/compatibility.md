# Hugo compatibility and known gaps

tsumo aims to be *Hugo-compatible where it matters* for real sites and themes, while keeping the engine small and maintainable.

## Compatibility matrix (high level)

| Area | Feature | Status | Notes |
| --- | --- | --- | --- |
| Markdown | GitHub Flavored Markdown (GFM) | ✅ | Markdig pipeline: GitHub heading IDs, tables, task lists, autolinks, fenced code blocks, emphasis extras |
| Content | Sections + nested paths | ✅ | `content/posts/series/part-1.md` → `/posts/series/part-1/` |
| Content | Leaf bundles (`index.md`) | ✅ | Copies non-`.md` bundle resources |
| Content | Branch bundles (`_index.md`) | ✅ | Home and nested section list pages |
| Front matter | YAML / TOML / JSON | ✅ | Common Hugo fields + `.Params` passthrough |
| Taxonomies | `tags` + `categories` | ✅ | Generates terms + term pages |
| Templates | Go templates (subset) | ✅ | `baseof`, `block`, `define`, `partial`, `if/else/else if`, `with`, `range`, `template` |
| Shortcodes | `{{< >}}` + `{{% %}}` | ✅ | Rendered via shortcode templates in `layouts/shortcodes/` |
| Menus | Config + front matter menus | ✅ | Merged + hierarchical (`parent`, `weight`) |
| Assets | Hugo-like pipeline (subset) | ✅ | `resources.*`, `css.Sass`, `Fingerprint`, `ExecuteAsTemplate` |
| Outputs | `index.xml`, `sitemap.xml`, `robots.txt` | ✅ | Generated unless you provide static versions |
| CLI | `build`, `server`, `new site`, `new` | ✅ | `server` supports watch + rebuild |
| Docs | Multi-repo mounts + nav + search | ✅ | Enabled by `tsumo.docs.json` (tsumo-specific) |
| Advanced Hugo | Multilingual builds | ❌ | Config is parsed, but only one language is built today |
| Advanced Hugo | Page resources image processing | ❌ | Not implemented |
| Advanced Hugo | Full template lookup order | ❌ | Intentional subset |
| Advanced Hugo | Pagination | ❌ | Not implemented |

## Compatibility fixtures

The automated compatibility contract builds the committed
`examples/basic-blog` and `examples/docs-site` projects. Tsumo does not yet
maintain a pinned corpus of external Hugo themes, so no broader theme
compatibility is claimed.

If you hit a theme that fails, it’s usually due to a missing template function/value. Please file an issue with:

- theme name + version
- the template error message
- the minimal site to reproduce
