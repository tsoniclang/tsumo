# Getting started

## Build tsumo from source

Source builds use workspace `file:` dependencies that expect sibling checkouts
of:

- `../tsonic`
- `../tsonic-csharp`
- `../csharp-runtime`
- `../csharp-js`
- `../csharp-nodejs`

From the `tsumo` repo root:

```bash
npm install
npm run build
```

`npm run build` prepares the provider reference assemblies, runs `tsonic build`
for each project (emitting C# under each package's ignored `out/csharp/`), and
then builds the user-owned `.csproj` projects with `dotnet build`. The CLI
binary is produced at:

- `./packages/cli/bin/Debug/net10.0/tsumo`

NativeAOT publish:

```bash
npm run -w tsumo-cli publish:aot
./packages/cli/bin/Release/net10.0/linux-x64/publish/tsumo --help
```

## Quick start: create and serve a site

```bash
./packages/cli/bin/Debug/net10.0/tsumo new site ./my-site
./packages/cli/bin/Debug/net10.0/tsumo server --source ./my-site
```

Create a new page under `content/`:

```bash
./packages/cli/bin/Debug/net10.0/tsumo new posts/first-post.md --source ./my-site
```

Build a static site:

```bash
./packages/cli/bin/Debug/net10.0/tsumo build --source ./my-site --destination public
```

## Try the included examples

Blog example:

```bash
./packages/cli/bin/Debug/net10.0/tsumo build --source ./examples/basic-blog
./packages/cli/bin/Debug/net10.0/tsumo server --source ./examples/basic-blog
```

Docs example (requires you to point mounts at real docs folders):

```bash
./packages/cli/bin/Debug/net10.0/tsumo build --source ./examples/docs-site
./packages/cli/bin/Debug/net10.0/tsumo server --source ./examples/docs-site
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
./packages/cli/bin/Debug/net10.0/tsumo build -s ./my-site --themesDir /path/to/hugo-themes
```

## Assets (Sass)

Some Hugo themes require the Sass pipeline (`css.Sass`). tsumo shells out to a Sass executable.

- Install Dart Sass (`sass` CLI), or set `TSUMO_SASS` to the full path of a Sass executable.

Example:

```bash
TSUMO_SASS=$(which sass) ./packages/cli/bin/Debug/net10.0/tsumo build -s ./my-site
```
