import process from "node:process";

import { initSite, newContent } from "@tsumo/engine/index.js";

import { logLine } from "../log-line.js";
import { reportUsageError } from "../report-usage-error.js";
import { readSourceDateEpoch } from "../source-date-epoch.js";

export const handleNew = (args: readonly string[]): void => {
  if (args.length >= 2 && args[1] === "site") {
    if (args.length < 3) {
      reportUsageError("Missing <dir> for `tsumo new site`");
      return;
    }
    if (args.length > 3) {
      reportUsageError(`Unknown new site option: ${args[3]!}`);
      return;
    }
    const dir = args[2]!;
    initSite(dir, readSourceDateEpoch());
    logLine(`Created site: ${dir}`);
    return;
  }

  if (args.length < 2) {
    reportUsageError("Missing <path.md> for `tsumo new`");
    return;
  }

  let contentSourceDir = process.cwd();
  for (let i = 2; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--source" || a === "-s") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      contentSourceDir = args[i + 1]!;
      i++;
    } else {
      reportUsageError(`Unknown new option: ${a}`);
      return;
    }
  }

  const created = newContent(contentSourceDir, args[1]!, readSourceDateEpoch());
  logLine(`Created content: ${created}`);
};
