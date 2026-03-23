import { process } from "node:process";
import type { int } from "@tsonic/core/types.js";

import { logErrorLine } from "./log-error-line.ts";
import { logLine } from "./log-line.ts";
import { printUsage } from "./print-usage.ts";
import { handleBuild } from "./commands/handle-build.ts";
import { handleNew } from "./commands/handle-new.ts";
import { handleServe } from "./commands/handle-serve.ts";

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

  const buildArgStart: int = first === "build" || first === "gen" || first === "generate" ? 1 : 0;
  handleBuild(args, buildArgStart);
}
