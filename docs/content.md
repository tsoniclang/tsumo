# Content and front matter

## Site structure (blog/site mode)

tsumo uses the same top-level directories Hugo does:

- `content/` — markdown content
- `layouts/` — templates (Go template subset)
- `static/` — files copied verbatim to the output
- `assets/` — files used by the assets pipeline (`resources.*`, `css.Sass`, fingerprinting)
- `themes/` — themes (optional; or use `--themesDir`)
- `archetypes/` — content templates used by `tsumo new`

Tsumo-managed source trees do not follow symbolic links or filesystem reparse
points. Content, layouts, static files, assets, themes, docs mounts, and page
bundle resources must be ordinary files and directories inside their declared
roots; encountering a link fails the build with
`TSUMO_FILESYSTEM_LINK_UNSUPPORTED`.

## Routing and bundles

### Regular pages

- `content/posts/hello.md` → `/posts/hello/` (writes `public/posts/hello/index.html`)

### Branch bundles (section list pages)

- `content/posts/_index.md` renders the section list page for `/posts/`
- `content/_index.md` renders the home page (`/`)

### Leaf bundles (page bundles)

- `content/posts/my-bundle/index.md` → `/posts/my-bundle/`
- Non-markdown files in the bundle directory are copied next to the generated output (for images, downloads, etc.).

## Front matter formats

tsumo supports YAML, TOML, and JSON front matter.

YAML and TOML front matter begin with `---` and `+++` respectively on the first
line and end with the same delimiter. JSON front matter begins with `{` as the
first byte of the file; leading whitespace means the JSON-looking text is
ordinary page content. TOML strings must be quoted.

Supported fields:

- `title` (string)
- `date` (string; parsed as a date/time)
- `draft` (bool)
- `description` (string)
- `slug` (string)
- `type` (string)
- `layout` (string)
- `tags` (string array)
- `categories` (string array)
- `params` (object/table)
- `menu` (page menu entries)

Any other scalar keys are stored in `.Params` and are available in templates.

Front matter is parsed into typed page and parameter models. Supported scalar
values are strings, booleans, and integer-like numbers. Arrays are supported for
fields such as `tags` and `categories`. Open-ended nested objects should live
under documented `params` shapes that templates read explicitly.

Malformed delimiters or syntax, duplicate fields, unknown nested shapes, and
values with the wrong scalar kind fail with a `TSUMO_FRONTMATTER_*` diagnostic
that identifies the content file and source location. A failed parse does not
publish a replacement site.

### YAML front matter example

```yaml
---
title: "Hello World"
date: "2026-01-12T00:00:00Z"
draft: false
tags: ["tsumo", "gfm"]
categories: ["meta"]
params:
  featured: true
---
```

## Summaries

- If your markdown contains `<!--more-->`, everything before it becomes `.Summary`.
- Otherwise the first markdown block becomes `.Summary`.

## Drafts

`draft: true` pages are excluded unless you pass `-D/--buildDrafts`.
