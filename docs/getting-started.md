# Getting started

## Build tsumo from source

tsumo is not currently published on npm. This repo uses workspace `file:` dependencies that expect sibling checkouts of:

- `../tsonic`
- `../tsbindgen`

From the `tsumo` repo root:

```bash
npm install
npm run build
```

The CLI binary is produced at:

- `./packages/cli/out/tsumo`

Optional: NativeAOT build:

```bash
npm run -w tsumo-cli build:aot
./packages/cli/out/tsumo-aot --help
```

## Quick start: create and serve a site

```bash
./packages/cli/out/tsumo new site ./my-site
./packages/cli/out/tsumo server --source ./my-site
```

Create a new page under `content/`:

```bash
./packages/cli/out/tsumo new posts/first-post.md --source ./my-site
```

Build a static site:

```bash
./packages/cli/out/tsumo build --source ./my-site --destination public
```

## Try the included examples

Blog example:

```bash
./packages/cli/out/tsumo build --source ./examples/basic-blog
./packages/cli/out/tsumo server --source ./examples/basic-blog
```

Docs example (requires you to point mounts at real docs folders):

```bash
./packages/cli/out/tsumo build --source ./examples/docs-site
./packages/cli/out/tsumo server --source ./examples/docs-site
```

## Themes

tsumo resolves themes like Hugo:

- If you pass `--themesDir <dir>`, it looks for `<themesDir>/<themeName>`.
- Otherwise it looks for `themes/<themeName>` under your site directory.

Set the theme name in `hugo.toml` (or `config.*`):

```toml
theme = "hugo-book"
```

Then build with a themes directory (example):

```bash
./packages/cli/out/tsumo build -s ./my-site --themesDir /path/to/hugo-themes
```

## Assets (Sass)

Some Hugo themes require the Sass pipeline (`css.Sass`). tsumo shells out to a Sass executable.

- Install Dart Sass (`sass` CLI), or set `TSUMO_SASS` to the full path of a Sass executable.

Example:

```bash
TSUMO_SASS=$(which sass) ./packages/cli/out/tsumo build -s ./my-site
```

