# tsumo
A hugo-inspired blog engine

tsumo is a Hugo-inspired static site generator implemented in TypeScript and compiled to native code with Tsonic (TS → C# → .NET).

## Repo layout

- `packages/engine` — core build + server engine (Tsonic library)
- `packages/cli` — `tsumo` CLI (Tsonic executable)
- `examples/basic-blog` — example site (Hugo-style layout)

## Build

```bash
npm install
npm run build
```

## Try the example

```bash
# Build the example site into examples/basic-blog/public
./packages/cli/out/tsumo build --source ./examples/basic-blog

# Dev server (watch + rebuild)
./packages/cli/out/tsumo server --source ./examples/basic-blog
```

## Commands

- `tsumo new site <dir>` — scaffold a new site
- `tsumo new <path.md> [--source <dir>]` — create new content under `content/`
- `tsumo build [--source <dir>]` — build site into `public/`
- `tsumo server [--source <dir>]` — serve `public/` (watch + rebuild by default)
