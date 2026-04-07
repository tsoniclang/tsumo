import { process } from "@tsonic/nodejs/process.js";

import { initSite, newContent } from "@tsumo/engine/index.js";

import { logErrorLine } from "../log-error-line.ts";
import { logLine } from "../log-line.ts";

export const handleNew = (args: readonly string[]): void => {
  if (args.length >= 2 && args[1] === "site") {
    if (args.length < 3) {
      logErrorLine("Missing <dir> for `tsumo new site`");
      process.exitCode = 2;
      return;
    }
    const dir = args[2]!;
    initSite(dir);
    logLine(`Created site: ${dir}`);
    return;
  }

  if (args.length < 2) {
    logErrorLine("Missing <path.md> for `tsumo new`");
    process.exitCode = 2;
    return;
  }

  let contentSourceDir = process.cwd();
  for (let i = 2; i < args.length; i++) {
    const a = args[i]!;
    if ((a === "--source" || a === "-s") && i + 1 < args.length) {
      contentSourceDir = args[i + 1]!;
      i++;
    }
  }

  const created = newContent(contentSourceDir, args[1]!);
  logLine(`Created content: ${created}`);
};
