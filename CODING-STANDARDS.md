# Coding Standards (Tsumo)

These rules are intentionally strict. The codebase is meant to stay “small-file, single-purpose” as it grows.

This project follows the same conventions as Clickmeter.

## File layout

- **Kebab-case file names** for all implementation files (e.g. `build-site.ts`, `parse-frontmatter.ts`).
- Prefer directory names that read like a sentence when combined with the file name
  (e.g. `engine/build/build-site.ts`, `cli/commands/handle-build.ts`).

## Public API shape

- **One exported function per implementation file.**
  - The exported function is the “unit of reuse” (domain operation, command handler, parser, etc).
  - **Internal helpers** (`function foo() {}`) are allowed inside the file.
  - **Types related to that exported function** may be exported from the same file.
- Avoid exporting “bags of unrelated helpers”.

## Composition

- Use small “wiring” modules that compose exported functions.
- Keep business logic deterministic and side-effect free where possible; push I/O to the edges.

## Naming

- Function names: `camelCase` (e.g. `buildSite`, `handleServe`).
- File names: `kebab-case` (e.g. `build-site.ts`, `handle-serve.ts`).
