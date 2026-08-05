import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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
  return mkdtempSync(join(tmpdir(), prefix));
}

export function copyFixture(sourceDir, prefix) {
  const target = makeTempDir(prefix);
  cpSync(sourceDir, target, { recursive: true });
  return target;
}

export function removeDir(path) {
  rmSync(path, { recursive: true, force: true });
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
