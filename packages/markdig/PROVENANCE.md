# Markdig provenance

This repo vendors the Markdig source (BSD-2-Clause) from the upstream Markdig repo:

- Commit: `cd7b9ca0ef66cb582232cbceaefbfe4195cf575b` (`Test netstandard (#915)`)

The upstream sources are copied into:

- `packages/markdig/vendor-src/Markdig/**`

We build a local `Markdig.dll` from that source via:

- `packages/markdig/vendor-src/Markdig.Vendored.csproj` → `libs/Markdig.dll` (committed)

That assembly is used as a local DLL dependency to provide GitHub Flavored Markdown (GFM) rendering in Tsumo.

TypeScript bindings are generated on-demand by `tsonic restore` into `node_modules/markdig-types` (not committed).

To regenerate the DLL:

- `npm run -w @tsumo/markdig build:dll`

To regenerate bindings:

- `npm run -w @tsumo/engine restore`
