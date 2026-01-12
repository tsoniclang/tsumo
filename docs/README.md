# tsumo documentation

tsumo is a Hugo-inspired static site generator implemented in TypeScript and compiled with Tsonic (TS → C# → .NET).

tsumo supports two primary workflows:

- **Blog/site mode**: build a Hugo-style site from `content/` + `layouts/` + `static/`.
- **Docs mode**: mount external doc folders into URL prefixes via `tsumo.docs.json` (multi-repo docs, link rewriting, nav, optional search index).

## Start here

- Getting started: `getting-started.md`
- CLI reference: `cli.md`
- Site configuration (`hugo.toml|yaml|json`): `configuration.md`
- Content + front matter: `content.md`
- Templates (Go template subset): `templates.md`
- Shortcodes + assets pipeline: `shortcodes-and-assets.md`
- Docs mode (`tsumo.docs.json`): `docs-mode.md`
- Hugo compatibility + known gaps: `compatibility.md`
