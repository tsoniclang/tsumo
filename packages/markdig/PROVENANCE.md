# Markdig provenance

This repo vendors the Markdig source (BSD-2-Clause) from the upstream Markdig repo:

- Path: `/home/jester/temp/markdig`
- Commit: `cd7b9ca0ef66cb582232cbceaefbfe4195cf575b` (`Test netstandard (#915)`)

The upstream sources are copied into:

- `packages/markdig/vendor-src/Markdig/**`

We build a local `Markdig.dll` from that source via:

- `packages/markdig/vendor-src/Markdig.Vendored.csproj` → `packages/markdig/vendor/net10.0/Markdig.dll` (gitignored)

That assembly is used (via `tsbindgen`-generated bindings) to provide GitHub Flavored Markdown (GFM) rendering in `@tsumo/engine`.

To regenerate the DLL + bindings:

- `npm run -w @tsumo/markdig bindings`
