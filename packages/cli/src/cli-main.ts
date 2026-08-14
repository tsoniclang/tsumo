import process from "node:process";
import type { int32 } from "@tsonic/core/types.js";
import { TsumoError } from "@tsumo/engine/index.js";

import { logErrorLine } from "./log-error-line.js";
import { logLine } from "./log-line.js";
import { printUsage } from "./print-usage.js";
import { handleBuild } from "./commands/handle-build.js";
import { handleNew } from "./commands/handle-new.js";
import { handleServe } from "./commands/handle-serve.js";

const VERSION = "0.0.0";

export function main(): void {
  const args = process.argv.slice(2);

  let first = "";
  for (const arg of args) {
    first = arg;
    break;
  }
  if (first === "-h" || first === "--help" || first === "help") {
    printUsage();
    return;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    logLine(VERSION);
    return;
  }

  const cmd = first === "" || first.startsWith("-") ? "build" : first;

  if (cmd === "new") {
    handleNew(args);
    return;
  }

  if (cmd === "server" || cmd === "serve") {
    handleServe(args);
    return;
  }

  if (cmd === "build" || cmd === "gen" || cmd === "generate") {
    // fall through to build handler
  } else {
    logErrorLine(`Unknown command: ${cmd}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const buildArgStart: int32 = first === "build" || first === "gen" || first === "generate" ? 1 : 0;
  handleBuild(args, buildArgStart);
}

try {
  main();
} catch (error) {
  logErrorLine(error instanceof TsumoError ? error.diagnostic.format() : `${error}`);
  process.exitCode = 1;
}
