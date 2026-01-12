# Content and front matter

## Site structure (blog/site mode)

tsumo uses the same top-level directories Hugo does:

- `content/` — markdown content
- `layouts/` — templates (Go template subset)
- `static/` — files copied verbatim to the output
- `assets/` — files used by the assets pipeline (`resources.*`, `css.Sass`, fingerprinting)
- `themes/` — themes (optional; or use `--themesDir`)
- `archetypes/` — content templates used by `tsumo new`

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

