import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { filePaths, makeTempDir, repoRoot, runTsumo } from "./helpers.mjs";

test("the committed docs example builds self-contained mounts, navigation, and search index", () => {
  const outDir = makeTempDir("tsumo-e2e-docs-");
  const result = runTsumo([
    "build",
    "--source", join(repoRoot, "examples/docs-site"),
    "--destination", outDir,
  ]);
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(filePaths(outDir), [
    "docs.css",
    "index.html",
    "search.js",
    "search.json",
    "tsonic/compiler-flow/index.html",
    "tsonic/index.html",
    "tsonic-csharp/index.html",
  ]);

  const search = readFileSync(join(outDir, "search.json"), "utf8");
  assert.match(search, /searchable-content-marker/u);

  const guide = readFileSync(join(outDir, "tsonic/compiler-flow/index.html"), "utf8");
  assert.match(guide, /Compiler Flow/u);
  assert.match(guide, /href="[^"]*tsonic\/?"/u);
  assert.match(
    guide,
    /href="https:\/\/github\.com\/tsoniclang\/tsumo\/blob\/main\/examples\/docs-site\/mounts\/tsonic\/compiler-flow\.md"/u,
  );

  const home = readFileSync(join(outDir, "tsonic/index.html"), "utf8");
  assert.match(home, /href="\/tsonic\/compiler-flow\/"/u);
  assert.match(home, /href="\/tsonic-csharp\/"/u);
});
