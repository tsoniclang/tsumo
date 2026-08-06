import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { repoRoot } from "./helpers.mjs";

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repoRoot, encoding: "utf8" },
).split("\0").filter((path) => path !== "" && existsSync(join(repoRoot, path)));

const sourceFiles = repositoryFiles.filter((path) =>
  /^packages\/(?:cli|engine|tests)\/src\/.*\.ts$/u.test(path)
);
const productSourceFiles = sourceFiles.filter((path) =>
  /^packages\/(?:cli|engine)\/src\/.*\.ts$/u.test(path)
);

test("authored TypeScript modules stay within the reviewed size boundary", () => {
  const oversized = sourceFiles.flatMap((path) => {
    const text = readFileSync(join(repoRoot, path), "utf8");
    const lineCount = text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    return lineCount > 600 ? [`${path}: ${lineCount} lines`] : [];
  });
  assert.deepEqual(oversized, []);
});

test("product source contains no retired Tsonic mechanisms", () => {
  const patterns = [
    ["retired Node module", /@tsonic\/nodejs\//u],
    ["retired generated binding package", /(?:markdig-types|photo-sauce-magic-scaler-types|xunit-types|@tsonic\/tsbindgen)/u],
    ["retired cast marker", /\b(?:trycast|asinterface|attributes)\s*(?:<|\()/u],
    ["TypeScript source import", /(?:from\s+|import\s*\()\s*["'][^"']+\.ts["']/u],
    ["CommonJS module operation", /\brequire\s*\(|\bmodule\.exports\b|\bexport\s*=/u],
    ["triple-slash reference", /^\s*\/\/\/\s*<reference\b/u],
    ["TypeScript namespace", /^\s*(?:export\s+)?namespace\s+/u],
    ["explicit class accessibility", /^\s*(?:public|private|protected)\s+/u],
    ["TypeScript override modifier", /^\s*override\s+/u],
    ["runtime reflection", /\b(?:System\.Reflection|MethodInfo\.Invoke|Activator\.CreateInstance|Assembly\.Load|GetProperties?\s*\(|GetMethods?\s*\()/u],
    ["unfinished product marker", /\b(?:TODO|FIXME|HACK)\b|\bbest[- ]effort\b|\bFor now\b/u],
  ];
  const violations = [];
  for (const path of sourceFiles) {
    const lines = readFileSync(join(repoRoot, path), "utf8").split("\n");
    for (let index = 0; index < lines.length; index++) {
      for (const [label, pattern] of patterns) {
        if (pattern.test(lines[index])) {
          violations.push(`${path}:${index + 1}: ${label}: ${lines[index].trim()}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("product source does not bypass shared recursive filesystem traversal", () => {
  const violations = productSourceFiles.flatMap((path) => {
    const text = readFileSync(join(repoRoot, path), "utf8");
    return /Directory\.(?:Get|Enumerate)(?:Files|Directories)\(|SearchOption\.AllDirectories/u.test(text)
      ? [`${path}: bypasses shared recursive filesystem traversal`]
      : [];
  });
  assert.deepEqual(violations, []);
});

test("compiler projects use one current source and target contract", () => {
  const projectNames = ["engine", "cli", "tests"];
  for (const projectName of projectNames) {
    const projectRoot = join(repoRoot, "packages", projectName);
    const manifest = readJson(join(projectRoot, "package.json"));
    const config = readJson(join(projectRoot, "tsonic.json"));
    assert.equal(manifest.type, "module", projectName);
    assert.equal(manifest.devDependencies["@tsonic/cli"].startsWith("file:"), true, projectName);
    assert.equal(manifest.devDependencies["@tsonic/target-csharp"].startsWith("file:"), true, projectName);
    assert.equal(manifest.devDependencies["@tsonic/csharp-nodejs"].startsWith("file:"), true, projectName);
    assert.equal(config.entryPoint.endsWith(".ts"), true, projectName);
    assert.equal(config.rootDir, "src", projectName);
    assert.equal(config.outDir, "out", projectName);
    assert.equal(config.targets.length, 1, projectName);
    assert.equal(config.targets[0].id, "csharp", projectName);
    assert.deepEqual(config.targets[0].surfaces, ["js"], projectName);
    assert.equal(typeof config.targets[0].options.projectFile, "string", projectName);
    assert.equal(config.targets[0].options.providerReferences.directories.length > 0, true, projectName);
  }

  const engineManifest = readJson(join(repoRoot, "packages/engine/package.json"));
  assert.equal(engineManifest.exports["./index.js"], "./src/index.ts");
  assert.equal(engineManifest.exports["."], undefined);
});

test("retired project configuration cannot return", () => {
  const projectFiles = repositoryFiles.filter((path) =>
    /(?:package\.json|tsonic[^/]*\.json|\.csproj|\.sh)$/u.test(path)
  );
  const patterns = [
    /\btsonic\s+(?:restore|run|test)\b/u,
    /\b(?:sourceRoot|outputDirectory|rootNamespace|buildOptions)\b/u,
    /generated\/tsonic\.csproj/u,
    /tsonic\.package\.json|tsonic\.workspace\.json|tsonic\.aot\.json/u,
  ];
  const violations = [];
  for (const path of projectFiles) {
    const text = readFileSync(join(repoRoot, path), "utf8");
    for (const pattern of patterns) {
      if (pattern.test(text)) violations.push(`${path}: ${pattern.source}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("generated and investigation artifacts remain untracked and ignored", () => {
  const forbiddenTracked = repositoryFiles.filter((path) =>
    path.startsWith(".analysis/") ||
    path.startsWith(".temp/") ||
    /(^|\/)public\d*(\/|$)/u.test(path) ||
    /\/(?:out|dist|bin|obj|node_modules)\//u.test(`/${path}/`) ||
    path.endsWith(".dll")
  );
  assert.deepEqual(forbiddenTracked, []);
  for (const path of [".analysis/probe.md", ".temp/probe", "packages/engine/out/probe.cs"]) {
    const ignored = execFileSync("git", ["check-ignore", path], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    assert.equal(ignored, path);
  }
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
