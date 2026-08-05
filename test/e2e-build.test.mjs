import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { copyFixture, makeTempDir, removeDir, repoRoot, runTsumo } from "./helpers.mjs";

test("builds the basic blog with the exact expected output inventory", () => {
  const outDir = makeTempDir("tsumo-e2e-build-");
  try {
    const result = runTsumo([
      "build",
      "--source", join(repoRoot, "examples/basic-blog"),
      "--destination", outDir,
    ]);
    assert.equal(result.status, 0, result.stderr);

    const expected = [
      "index.html",
      "index.xml",
      "sitemap.xml",
      "robots.txt",
      "style.css",
      "posts/index.html",
      "posts/hello-world/index.html",
      "posts/series/index.html",
      "posts/series/part-1/index.html",
      "posts/bundled-post/index.html",
      "posts/bundled-post/cover.txt",
      "tags/index.html",
    ];
    for (const relPath of expected) {
      assert.ok(existsSync(join(outDir, relPath)), `missing expected output: ${relPath}`);
    }

    const home = readFileSync(join(outDir, "index.html"), "utf8");
    assert.match(home, /<html/u);
    const rss = readFileSync(join(outDir, "index.xml"), "utf8");
    assert.match(rss, /<rss/u);
  } finally {
    removeDir(outDir);
  }
});

test("omits drafts by default and includes them with --buildDrafts", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-drafts-");
  const outDefault = makeTempDir("tsumo-e2e-drafts-out1-");
  const outDrafts = makeTempDir("tsumo-e2e-drafts-out2-");
  try {
    writeFileSync(
      join(site, "content/posts/secret-draft.md"),
      "---\ntitle: Secret Draft\ndraft: true\n---\n\nHidden body.\n",
    );

    let result = runTsumo(["build", "--source", site, "--destination", outDefault]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outDefault, "posts/secret-draft/index.html")), false);

    result = runTsumo(["build", "--source", site, "--destination", outDrafts, "--buildDrafts"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(outDrafts, "posts/secret-draft/index.html")), true);
  } finally {
    removeDir(site);
    removeDir(outDefault);
    removeDir(outDrafts);
  }
});

test("identical inputs produce identical output inventories", () => {
  const outA = makeTempDir("tsumo-e2e-det-a-");
  const outB = makeTempDir("tsumo-e2e-det-b-");
  try {
    for (const out of [outA, outB]) {
      const result = runTsumo([
        "build",
        "--source", join(repoRoot, "examples/basic-blog"),
        "--destination", out,
      ]);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(inventory(outA), inventory(outB));
  } finally {
    removeDir(outA);
    removeDir(outB);
  }
});

test("CLI failure paths exit non-zero with usage output", () => {
  const unknown = runTsumo(["definitely-not-a-command"]);
  assert.equal(unknown.status, 2, `stdout: ${unknown.stdout}`);
  assert.match(unknown.stdout + unknown.stderr, /USAGE/u);

  const help = runTsumo(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /USAGE/u);
});

function inventory(root) {
  const entries = [];
  const visit = (dir, prefix) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = prefix === "" ? name : `${prefix}/${name}`;
      const stat = statSync(full);
      if (stat.isDirectory()) visit(full, rel);
      else entries.push(`${rel}:${stat.size}`);
    }
  };
  visit(root, "");
  return entries;
}
