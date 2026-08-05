import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const testRunsRoot = join(repoRoot, ".temp/test-runs");

export function tsumoBinary() {
  const binary = join(repoRoot, "packages/cli/bin/Debug/net10.0/tsumo");
  if (!existsSync(binary)) {
    throw new Error("Built tsumo CLI not found. Run `npm run build` first.");
  }
  return binary;
}

export function runTsumo(args, options = {}) {
  return spawnSync(tsumoBinary(), args, {
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
}

export function spawnTsumo(args, options = {}) {
  return spawn(tsumoBinary(), args, { stdio: ["ignore", "pipe", "pipe"], ...options });
}

export function makeTempDir(prefix) {
  mkdirSync(testRunsRoot, { recursive: true });
  return mkdtempSync(join(testRunsRoot, prefix));
}

export function copyFixture(sourceDir, prefix) {
  const target = makeTempDir(prefix);
  cpSync(sourceDir, target, { recursive: true });
  return target;
}

export function filePaths(root) {
  return walkFiles(root).map(({ path }) => path);
}

export function fileManifest(root) {
  return walkFiles(root).map(({ path, fullPath }) => {
    const hash = createHash("sha256").update(readFileSync(fullPath)).digest("hex");
    return `${path}:${hash}`;
  });
}

function walkFiles(root) {
  const entries = [];
  const visit = (directory, prefix) => {
    for (const name of readdirSync(directory).sort()) {
      const fullPath = join(directory, name);
      const path = prefix === "" ? name : `${prefix}/${name}`;
      if (statSync(fullPath).isDirectory()) visit(fullPath, path);
      else entries.push({ path, fullPath });
    }
  };
  visit(root, "");
  return entries;
}

export async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 200));
    }
  }
  throw new Error(`Server at ${url} did not answer within ${timeoutMs}ms: ${lastError}`);
}
