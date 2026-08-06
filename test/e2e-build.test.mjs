import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { copyFixture, fileManifest, filePaths, makeTempDir, repoRoot, runTsumo } from "./helpers.mjs";

const expectedBasicBlogPaths = [
  "categories/docs/index.html",
  "categories/index.html",
  "categories/meta/index.html",
  "index.html",
  "index.xml",
  "posts/bundled-post/assets/note.txt",
  "posts/bundled-post/cover.txt",
  "posts/bundled-post/index.html",
  "posts/hello-world/index.html",
  "posts/index.html",
  "posts/series/index.html",
  "posts/series/part-1/index.html",
  "robots.txt",
  "sitemap.xml",
  "style.css",
  "tags/bundle/index.html",
  "tags/gfm/index.html",
  "tags/hello/index.html",
  "tags/index.html",
  "tags/series/index.html",
  "tags/tsumo/index.html",
];

test("builds the basic blog with the exact expected output inventory", () => {
  const outDir = makeTempDir("tsumo-e2e-build-");
  const result = runTsumo([
    "build",
    "--source", join(repoRoot, "examples/basic-blog"),
    "--destination", outDir,
  ]);
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(filePaths(outDir), expectedBasicBlogPaths);

  const home = readFileSync(join(outDir, "index.html"), "utf8");
  assert.match(home, /<html/u);
  const rss = readFileSync(join(outDir, "index.xml"), "utf8");
  assert.match(rss, /<rss/u);

  const post = readFileSync(join(outDir, "posts/hello-world/index.html"), "utf8");
  assert.match(post, /class="contains-task-list"/u);
  assert.match(post, /<table>/u);
  assert.match(post, /<del>old<\/del>/u);
  assert.match(post, /<a href="https:\/\/tsonic\.org">https:\/\/tsonic\.org<\/a>/u);
  assert.match(post, /<code class="language-bash">/u);
});

test("builds YAML, TOML, and JSON front matter through one typed page model", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-frontmatter-");
  const outDir = makeTempDir("tsumo-e2e-frontmatter-out-");
  writeFileSync(
    join(site, "content/posts/toml-page.md"),
    "+++\ntitle = \"TOML Page\"\ndate = \"2026-01-08T00:00:00Z\"\nslug = \"toml-contract\"\ndraft = false\n+++\n\nTOML body marker.\n",
  );
  writeFileSync(
    join(site, "content/posts/json-page.md"),
    "{\"title\":\"JSON Page\",\"date\":\"2026-01-06T00:00:00Z\",\"slug\":\"json-contract\",\"draft\":false}\n\nJSON body marker.\n",
  );

  const result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.equal(result.status, 0, result.stderr);

  const yaml = readFileSync(join(outDir, "posts/hello-world/index.html"), "utf8");
  const toml = readFileSync(join(outDir, "posts/toml-contract/index.html"), "utf8");
  const json = readFileSync(join(outDir, "posts/json-contract/index.html"), "utf8");
  assert.match(yaml, /<h2>Hello World<\/h2>/u);
  assert.match(toml, /<h2>TOML Page<\/h2>[\s\S]*TOML body marker\./u);
  assert.match(json, /<h2>JSON Page<\/h2>[\s\S]*JSON body marker\./u);
});

test("renders shortcodes, Markdown hooks, and fingerprinted resources", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-feature-contract-");
  const outDir = makeTempDir("tsumo-e2e-feature-contract-out-");
  mkdirSync(join(site, "layouts/shortcodes"), { recursive: true });
  mkdirSync(join(site, "layouts/_markup"), { recursive: true });
  mkdirSync(join(site, "layouts/posts"), { recursive: true });
  mkdirSync(join(site, "assets"), { recursive: true });

  writeFileSync(
    join(site, "layouts/shortcodes/badge.html"),
    "<span data-shortcode=\"{{ .Get \"label\" }}\">{{ .Get \"label\" }}</span>",
  );
  writeFileSync(
    join(site, "layouts/_markup/render-link.html"),
    "<a data-render-hook=\"link\" href=\"{{ .Destination }}\">{{ .Text }}</a>",
  );
  writeFileSync(
    join(site, "layouts/posts/single.html"),
    "{{ define \"main\" }}{{ $asset := resources.Get \"contract.css\" | resources.Fingerprint }}<link data-resource=\"fingerprint\" href=\"{{ $asset.RelPermalink }}\" integrity=\"{{ $asset.Data.Integrity }}\"><article>{{ .Content }}</article>{{ end }}",
  );
  writeFileSync(join(site, "assets/contract.css"), "body { color: rebeccapurple; }\n");
  writeFileSync(
    join(site, "content/posts/feature-contract.md"),
    "---\ntitle: Feature Contract\ndate: \"2026-01-05T00:00:00Z\"\ndraft: false\n---\n\n[Hook text](https://example.invalid/path)\n\n{{< badge label=\"named\" >}}\n",
  );

  const result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.equal(result.status, 0, result.stderr);

  const output = readFileSync(join(outDir, "posts/feature-contract/index.html"), "utf8");
  assert.match(output, /data-render-hook="link" href="https:\/\/example\.invalid\/path"/u);
  assert.match(output, /data-shortcode="named">named<\/span>/u);
  const resourceMatch = output.match(/href="\/(contract\.[a-f0-9]{16}\.css)" integrity="(sha256-[A-Za-z0-9+/=]+)"/u);
  assert.notEqual(resourceMatch, null, output);
  assert.equal(readFileSync(join(outDir, resourceMatch[1]), "utf8"), "body { color: rebeccapurple; }\n");
});

test("omits drafts by default and includes them with --buildDrafts", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-drafts-");
  const outDefault = makeTempDir("tsumo-e2e-drafts-out1-");
  const outDrafts = makeTempDir("tsumo-e2e-drafts-out2-");
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
});

test("identical inputs produce identical output inventories", () => {
  const outA = makeTempDir("tsumo-e2e-det-a-");
  const outB = makeTempDir("tsumo-e2e-det-b-");
  const environment = { ...process.env, SOURCE_DATE_EPOCH: "1767225600" };
  for (const out of [outA, outB]) {
    const result = runTsumo([
      "build",
      "--source", join(repoRoot, "examples/basic-blog"),
      "--destination", out,
    ], { env: environment });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(fileManifest(outA), fileManifest(outB));
  assert.match(readFileSync(join(outA, "index.xml"), "utf8"), /2026-01-01T00:00:00\.000Z/u);
  assert.match(readFileSync(join(outA, "sitemap.xml"), "utf8"), /2026-01-01T00:00:00\.000Z/u);
});

test("rejects an invalid reproducible-build timestamp", () => {
  const outDir = makeTempDir("tsumo-e2e-invalid-epoch-");
  const result = runTsumo([
    "build",
    "--source", join(repoRoot, "examples/basic-blog"),
    "--destination", outDir,
  ], { env: { ...process.env, SOURCE_DATE_EPOCH: "not-a-timestamp" } });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /SOURCE_DATE_EPOCH must be a non-negative integer/u);
  assert.deepEqual(filePaths(outDir), []);
});

test("scaffolding uses the explicit build clock and rejects content path escapes", () => {
  const site = makeTempDir("tsumo-e2e-scaffold-");
  const environment = { ...process.env, SOURCE_DATE_EPOCH: "1767225600" };

  let result = runTsumo(["new", "site", site], { env: environment });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(join(site, "content/posts/hello-world.md"), "utf8"),
    /date: "2026-01-01T00:00:00\.000Z"/u,
  );

  result = runTsumo(["new", "posts/pinned.md", "--source", site], { env: environment });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(join(site, "content/posts/pinned.md"), "utf8"),
    /date: "2026-01-01T00:00:00\.000Z"/u,
  );

  const escaped = join(dirname(site), "escaped-content.md");
  result = runTsumo(["new", "../../escaped-content.md", "--source", site], { env: environment });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /escapes the site's content directory/u);
  assert.equal(existsSync(escaped), false);
});

test("failed builds preserve the complete prior output and the next build recovers", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-publication-");
  const outDir = makeTempDir("tsumo-e2e-publication-out-");
  let result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.equal(result.status, 0, result.stderr);

  const priorInventory = fileManifest(outDir);
  const priorHome = readFileSync(join(outDir, "index.html"), "utf8");
  const failingContentPath = join(site, "content/posts/publication-failure.md");
  writeFileSync(failingContentPath, "{\"title\": invalid}\nbody\n", "utf8");

  result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.notEqual(result.status, 0, "invalid template must fail the build");
  assert.deepEqual(fileManifest(outDir), priorInventory);
  assert.equal(readFileSync(join(outDir, "index.html"), "utf8"), priorHome);
  assert.deepEqual(publicationScratchEntries(outDir), []);

  writeFileSync(failingContentPath, "{\"title\":\"recovered\",\"draft\":true}\nbody\n", "utf8");
  result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(outDir, "index.html"), "utf8"), priorHome);
  assert.deepEqual(publicationScratchEntries(outDir), []);
});

test("malformed delimited front matter fails closed without publishing output", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-frontmatter-failure-");
  const outDir = makeTempDir("tsumo-e2e-frontmatter-failure-out-");
  writeFileSync(
    join(site, "content/posts/unclosed.md"),
    "---\ntitle: Unclosed\nbody without a closing delimiter\n",
  );

  const result = runTsumo(["build", "--source", site, "--destination", outDir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /YAML front matter is missing its closing --- delimiter/u);
  assert.deepEqual(filePaths(outDir), []);
});

test("clean and no-clean builds publish exact destination policies", () => {
  const outDir = makeTempDir("tsumo-e2e-clean-policy-");
  const source = join(repoRoot, "examples/basic-blog");
  const retained = join(outDir, "retained.txt");

  writeFileSync(retained, "keep me\n", "utf8");
  let result = runTsumo(["build", "--source", source, "--destination", outDir, "--no-clean"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(retained, "utf8"), "keep me\n");

  result = runTsumo(["build", "--source", source, "--destination", outDir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(retained), false);
  assert.deepEqual(filePaths(outDir), expectedBasicBlogPaths);
});

test("output paths cannot escape or contain the source site", () => {
  const site = copyFixture(join(repoRoot, "examples/basic-blog"), "tsumo-e2e-output-boundary-");
  const escapedName = `outside-${basename(site)}`;
  const escaped = join(dirname(site), escapedName);

  const escaping = runTsumo(["build", "--source", site, "--destination", `../${escapedName}`]);
  assert.notEqual(escaping.status, 0);
  assert.match(escaping.stdout + escaping.stderr, /escapes the site root/u);
  assert.equal(existsSync(escaped), false);

  const overlapping = runTsumo(["build", "--source", site, "--destination", site]);
  assert.notEqual(overlapping.status, 0);
  assert.match(overlapping.stdout + overlapping.stderr, /cannot contain the source site/u);
  assert.equal(existsSync(join(site, "README.md")), true);
});

test("CLI failure paths exit non-zero with usage output", () => {
  const unknown = runTsumo(["definitely-not-a-command"]);
  assert.equal(unknown.status, 2, `stdout: ${unknown.stdout}`);
  assert.match(unknown.stdout + unknown.stderr, /USAGE/u);

  const help = runTsumo(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /USAGE/u);

  const unknownBuildOption = runTsumo(["build", "--wat"]);
  assert.equal(unknownBuildOption.status, 2);
  assert.match(unknownBuildOption.stdout + unknownBuildOption.stderr, /Unknown build option: --wat/u);

  const missingBuildValue = runTsumo(["build", "--source"]);
  assert.equal(missingBuildValue.status, 2);
  assert.match(missingBuildValue.stdout + missingBuildValue.stderr, /Missing value for --source/u);

  const invalidPort = runTsumo(["server", "--port", "0"]);
  assert.equal(invalidPort.status, 2);
  assert.match(invalidPort.stdout + invalidPort.stderr, /Invalid port: 0/u);
});

function publicationScratchEntries(outputDir) {
  const absoluteOutputDir = resolve(outputDir);
  const key = createHash("sha256").update(absoluteOutputDir).digest("hex").slice(0, 24);
  return readdirSync(dirname(absoluteOutputDir))
    .filter((name) => name.startsWith(`.tsumo-output-${key}.`));
}
