# docs-site example

This example demonstrates **docs mode** using `tsumo.docs.json`.

It mounts one or more external directories (often from other repos) into URL prefixes and builds a docs site with:

- mount navigation (parsed from a TOC in a markdown file)
- markdown link rewriting (`*.md` → generated routes)
- optional search index (`search.json`)

## Configure mounts

Edit `examples/docs-site/tsumo.docs.json` and update each mount’s `source` to point at a real docs directory on your machine.

## Run

From the repo root:

```bash
./packages/cli/out/tsumo build --source ./examples/docs-site
./packages/cli/out/tsumo server --source ./examples/docs-site
```

