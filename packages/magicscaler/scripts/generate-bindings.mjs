import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

const require = createRequire(join(projectRoot, "package.json"));
const resolvePkgRoot = (pkgName) => {
  try {
    return dirname(require.resolve(`${pkgName}/package.json`));
  } catch {
    // Fall through.
  }

  try {
    let dir = dirname(require.resolve(pkgName));
    while (true) {
      if (existsSync(join(dir, "package.json"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Fall through.
  }

  const searchPaths = require.resolve.paths(pkgName) ?? [];
  for (const base of searchPaths) {
    const pkgDir = join(base, pkgName);
    if (existsSync(join(pkgDir, "package.json"))) return pkgDir;
  }

  throw new Error(`Failed to resolve package root: ${pkgName}`);
};

const tsbindgenLib = resolvePkgRoot("@tsonic/tsbindgen");
const tsbindgenDll = join(tsbindgenLib, "lib", "tsbindgen.dll");

if (!existsSync(tsbindgenDll)) {
  console.error(`Missing tsbindgen DLL: ${tsbindgenDll}`);
  console.error("Ensure @tsonic/tsbindgen is installed and built (lib/tsbindgen.dll).");
  process.exit(1);
}

const dotnetLib = resolvePkgRoot("@tsonic/dotnet");
const coreLib = resolvePkgRoot("@tsonic/core");

const dllDir = join(projectRoot, "vendor", "net8.0");
const dllPath = join(dllDir, "PhotoSauce.MagicScaler.dll");

if (!existsSync(dllPath)) {
  console.error(`Missing MagicScaler DLL: ${dllPath}`);
  process.exit(1);
}

const listDotnetRuntimes = () => {
  const result = spawnSync("dotnet", ["--list-runtimes"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const msg = result.stderr || result.stdout || "Unknown error";
    throw new Error(`dotnet --list-runtimes failed:\n${msg}`);
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries = [];
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\[(.+)\]$/);
    if (!match) continue;
    const [, name, version, baseDir] = match;
    if (!name || !version || !baseDir) continue;
    entries.push({ name, version, dir: join(baseDir, version) });
  }

  const parseVer = (v) => v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const cmp = (a, b) => {
    const av = parseVer(a);
    const bv = parseVer(b);
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
      const d = (av[i] ?? 0) - (bv[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };

  const byName = new Map();
  for (const e of entries) {
    const existing = byName.get(e.name);
    if (!existing || cmp(existing.version, e.version) < 0) {
      byName.set(e.name, e);
    }
  }

  return Array.from(byName.values());
};

const runtimes = listDotnetRuntimes();

const outDir = join(projectRoot, "dist", "tsonic", "bindings");
const args = ["generate", "-a", dllPath, "-o", outDir, "--lib", dotnetLib, "--lib", coreLib];

for (const rt of runtimes) args.push("--ref-dir", rt.dir);
args.push("--ref-dir", dllDir);

const gen = spawnSync("dotnet", [tsbindgenDll, ...args], { stdio: "inherit" });
process.exit(gen.status ?? 1);
