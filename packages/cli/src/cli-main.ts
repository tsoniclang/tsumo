import { Environment } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";

import { logErrorLine } from "./log-error-line.ts";
import { logLine } from "./log-line.ts";
import { printUsage } from "./print-usage.ts";
import { handleBuild } from "./commands/handle-build.ts";
import { handleNew } from "./commands/handle-new.ts";
import { handleServe } from "./commands/handle-serve.ts";

const VERSION = "0.0.0";

export function main(): void {
  const argv = Environment.GetCommandLineArgs();
  const argsList = new List<string>();
  for (let i = 1; i < argv.Length; i++) argsList.Add(argv[i]!);
  const args = argsList.ToArray();

  const first = args.Length > 0 ? args[0]! : "";
  if (first === "-h" || first === "--help" || first === "help") {
    printUsage();
    return;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    logLine(VERSION);
    return;
  }

  const cmd = first === "" || first.StartsWith("-") ? "build" : first;

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
    Environment.ExitCode = 2;
    return;
  }

  const buildArgStart: int = first === "build" || first === "gen" || first === "generate" ? 1 : 0;
  handleBuild(args, buildArgStart);
}
