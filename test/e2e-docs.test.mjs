import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { filePaths, makeTempDir, repoRoot, runTsumo } from "./helpers.mjs";

test("docs mode builds self-contained mounts, navigation, and search index", () => {
  const outDir = makeTempDir("tsumo-e2e-docs-");
  const result = runTsumo([
    "build",
    "--source", join(repoRoot, "test/fixtures/docs-site"),
    "--destination", outDir,
  ]);
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(filePaths(outDir), [
    "alpha/guide/index.html",
    "alpha/index.html",
    "beta/index.html",
    "docs.css",
    "index.html",
    "search.js",
    "search.json",
  ]);

  const search = readFileSync(join(outDir, "search.json"), "utf8");
  assert.match(search, /searchable-content-marker/u);

  const guide = readFileSync(join(outDir, "alpha/guide/index.html"), "utf8");
  assert.match(guide, /Alpha Guide/u);
  assert.match(guide, /href="[^"]*alpha\/?"/u);
});
