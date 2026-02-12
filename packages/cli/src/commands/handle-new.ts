import { Environment } from "@tsonic/dotnet/System.js";

import { initSite, newContent } from "@tsumo/engine/Tsumo.Engine.scaffold.js";

import { logErrorLine } from "../log-error-line.ts";
import { logLine } from "../log-line.ts";

export const handleNew = (args: readonly string[]): void => {
  if (args.Length >= 2 && args[1] === "site") {
    if (args.Length < 3) {
      logErrorLine("Missing <dir> for `tsumo new site`");
      Environment.ExitCode = 2;
      return;
    }
    const dir = args[2]!;
    initSite(dir);
    logLine(`Created site: ${dir}`);
    return;
  }

  if (args.Length < 2) {
    logErrorLine("Missing <path.md> for `tsumo new`");
    Environment.ExitCode = 2;
    return;
  }

  let contentSourceDir = Environment.CurrentDirectory;
  for (let i = 2; i < args.Length; i++) {
    const a = args[i]!;
    if ((a === "--source" || a === "-s") && i + 1 < args.Length) {
      contentSourceDir = args[i + 1]!;
      i++;
    }
  }

  const created = newContent(contentSourceDir, args[1]!);
  logLine(`Created content: ${created}`);
};
