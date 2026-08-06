# docs-site example

This example demonstrates **docs mode** using `tsumo.docs.json`.

It mounts one or more directories into URL prefixes and builds a docs site with:

- mount navigation (parsed from a TOC in a markdown file)
- markdown link rewriting (`*.md` → generated routes)
- optional search index (`search.json`)

## Included mounts

The committed `mounts/tsonic` and `mounts/tsonic-csharp` directories make this
example runnable immediately after checkout. They also demonstrate independent
navigation trees, cross-document links, search indexing, and edit-link metadata.

To mount documentation from another repository, edit `tsumo.docs.json` and
replace a mount's `source`, `repoUrl`, and `repoPath`. Relative `source` paths
are resolved from this example directory.

## Run

From the repo root:

```bash
./packages/cli/bin/Debug/net10.0/tsumo build --source ./examples/docs-site
./packages/cli/bin/Debug/net10.0/tsumo server --source ./examples/docs-site
```
