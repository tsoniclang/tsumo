import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { makeTempDir, removeDir, repoRoot, runTsumo } from "./helpers.mjs";

test("docs mode builds self-contained mounts, navigation, and search index", () => {
  const outDir = makeTempDir("tsumo-e2e-docs-");
  try {
    const result = runTsumo([
      "build",
      "--source", join(repoRoot, "test/fixtures/docs-site"),
      "--destination", outDir,
    ]);
    assert.equal(result.status, 0, result.stderr);

    assert.ok(existsSync(join(outDir, "index.html")), "docs home missing");
    assert.ok(existsSync(join(outDir, "alpha/guide/index.html")), "mounted alpha guide missing");
    assert.ok(existsSync(join(outDir, "beta/index.html")), "mounted beta home missing");
    assert.ok(existsSync(join(outDir, "search.json")), "search index missing");

    const search = readFileSync(join(outDir, "search.json"), "utf8");
    assert.match(search, /searchable-content-marker/u);

    const guide = readFileSync(join(outDir, "alpha/guide/index.html"), "utf8");
    assert.match(guide, /Alpha Guide/u);
    assert.match(guide, /href="[^"]*alpha\/?"/u);
  } finally {
    removeDir(outDir);
  }
});
