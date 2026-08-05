# @tsumo/markdig

Internal workspace package that vendors the Markdig source and builds a
deterministic local `Markdig.dll`.

`scripts/prepare-provider-references.sh` builds this project and copies the
assembly into the active immutable provider snapshot. That one artifact is
both the Tsonic provider reflection input (`@tsonic/dotnet/Markdig*.js`
declarations) and the `<Reference>` compile input of the user-owned
`Tsumo.Engine.csproj` / `Tsumo.Cli.csproj` / `Tsumo.Tests.csproj` projects, so
source checking and target compilation share one assembly contract.

- Markdig upstream: https://github.com/xoofx/markdig
- License: BSD-2-Clause (see `LICENSE.markdig.txt`)
- Provenance: see `PROVENANCE.md`

Rebuild the vendored assembly by itself:

```bash
npm run -w @tsumo/markdig build:dll
```

This package is not meant to be published.
