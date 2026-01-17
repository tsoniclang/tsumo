# @tsumo/markdig

Internal workspace package that vendors the Markdig source and builds a local `Markdig.dll`.

Tsumo consumes Markdig as a local DLL dependency (via `tsonic.json`). TypeScript bindings for Markdig are generated on-demand by `tsonic restore` into `node_modules/markdig-types` (not committed).

- Markdig upstream: https://github.com/xoofx/markdig
- License: BSD-2-Clause (see `LICENSE.markdig.txt`)
- Provenance: see `PROVENANCE.md`

Rebuild the vendored DLL:

```bash
npm run -w @tsumo/markdig build:dll
```

This package is not meant to be published.
