import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { copyFixture, repoRoot, spawnTsumo, waitForHttp } from "./helpers.mjs";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("server binds the requested host and serves text and binary responses", async () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-server-");
  writeFileSync(join(site, "static/pixel.png"), onePixelPng);

  const port = 20000 + Math.floor(Math.random() * 20000);
  const host = "127.0.0.1";
  const server = spawnTsumo([
    "server",
    "--source", site,
    "--host", host,
    "--port", String(port),
    "--no-watch",
  ]);
  const stderrChunks = [];
  server.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  try {
    const home = await waitForHttp(`http://${host}:${port}/`);
    assert.equal(home.status, 200);
    const homeText = await home.text();
    assert.match(homeText, /<html/u);

    const css = await fetch(`http://${host}:${port}/style.css`);
    assert.equal(css.status, 200);

    const binary = await fetch(`http://${host}:${port}/pixel.png`);
    assert.equal(binary.status, 200);
    const bytes = Buffer.from(await binary.arrayBuffer());
    assert.deepEqual(bytes, onePixelPng, "binary body must round-trip exactly");

    const missing = await fetch(`http://${host}:${port}/definitely-missing-path`);
    assert.equal(missing.status, 404);
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      server.on("exit", resolveExit);
      setTimeout(() => {
        server.kill("SIGKILL");
        resolveExit();
      }, 5000);
    });
  }
});
