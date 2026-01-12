# CLI reference

## Commands

- `tsumo build [options]` (default command) — generate static site into `public/`
- `tsumo server [options]` — build + serve output (watch + rebuild by default)
- `tsumo new site <dir>` — scaffold a new site
- `tsumo new <path.md> [--source <dir>]` — create new content under `content/`
- `tsumo version` — print version

## Build options

- `-s, --source <dir>`: site directory (default: current directory)
- `-d, --destination <dir>`: output directory (default: `public`)
- `-D, --buildDrafts`: include `draft: true` content
- `--baseURL <url>`: override `baseURL` from config
- `--themesDir <dir>`: themes directory (like Hugo `--themesDir`)
- `--no-clean`: do not wipe destination dir before building

## Server options

- `-s, --source <dir>`: site directory (default: current directory)
- `-p, --port <port>`: port (default: `1313`)
- `--host <host>`: host/interface (default: `localhost`)
- `--watch` / `--no-watch`: watch and rebuild (default: `--watch`)
- `-D, --buildDrafts`: include `draft: true` content
- `--themesDir <dir>`: themes directory (like Hugo `--themesDir`)
- `--no-clean`: do not wipe destination dir before building

## Environment variables

- `TSUMO_SASS`: full path to a Sass compiler executable (Dart Sass `sass` CLI). Used by `css.Sass` in templates.

