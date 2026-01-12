# Docs mode (`tsumo.docs.json`)

If a site directory contains `tsumo.docs.json`, tsumo switches into **docs mode** and builds documentation pages by mounting one or more external directories into URL prefixes.

Docs mode features:

- Content mounts (multi-repo docs)
- Path-preserving routing (`README.md` / `index.md` / `_index.md` are treated as directory index pages)
- Markdown link rewriting (`*.md` links → generated routes)
- Optional search index (`search.json`)
- Optional “Edit on GitHub” URLs (when repo metadata is provided)
- Navigation generated from a TOC section in a markdown file (or from a JSON nav file)

## Config schema (example)

```json
{
  "siteName": "My docs",
  "homeMount": "Project A",
  "strictLinks": false,
  "search": true,
  "searchFile": "search.json",
  "mounts": [
    {
      "name": "Project A",
      "source": "../project-a/docs",
      "prefix": "/project-a/",
      "repoUrl": "https://github.com/org/project-a",
      "repoBranch": "main",
      "repoPath": "docs",
      "navPath": "README.md"
    }
  ]
}
```

### Mount fields

- `source` (required): directory on disk to mount
- `prefix` (required): URL prefix to mount under (e.g. `/tsonic/`)
- `name`: display name (defaults to prefix)
- `repoUrl`, `repoBranch`, `repoPath`: used to compute GitHub blob links for out-of-mount links and edit URLs
- `navPath`: markdown file to parse navigation from (default: `README.md`); if it ends in `.json`, it is parsed as a nav manifest

## Navigation

### Markdown TOC nav

If `navPath` points to a markdown file, tsumo looks for a `## Table of Contents` section and extracts markdown links under it.

### JSON nav

If `navPath` ends in `.json`, it expects an array (or `{ "items": [...] }`) of items:

```json
[
  { "title": "Intro", "path": "README.md" },
  { "title": "API", "children": [{ "title": "CLI", "path": "cli.md" }] }
]
```

Each item supports:

- `title` (required)
- `url` (explicit URL) or `path` (markdown path resolved like a markdown link)
- `children` (nested items)

