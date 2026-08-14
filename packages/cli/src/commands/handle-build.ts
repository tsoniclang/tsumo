import process from "node:process";
import type { int32 } from "@tsonic/core/types.js";

import { BuildRequest, buildSite } from "@tsumo/engine/index.js";

import { logLine } from "../log-line.js";
import { reportUsageError } from "../report-usage-error.js";
import { readSourceDateEpoch } from "../source-date-epoch.js";

export const handleBuild = (args: readonly string[], buildArgStart: int32): void => {
  let buildSourceDir = process.cwd();
  let buildDestinationDir = "public";
  let buildBaseURL: string | undefined = undefined;
  let buildThemesDir: string | undefined = undefined;
  let includeDrafts = false;
  let cleanDestinationDir = true;

  for (let i = buildArgStart; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--source" || a === "-s") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      buildSourceDir = args[i + 1]!;
      i++;
    } else if (a === "--destination" || a === "-d") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      buildDestinationDir = args[i + 1]!;
      i++;
    } else if (a === "--baseURL" || a === "--baseurl") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      buildBaseURL = args[i + 1]!;
      i++;
    } else if (a === "--themesDir" || a === "--themesdir") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      buildThemesDir = args[i + 1]!;
      i++;
    } else if (a === "-D" || a === "--buildDrafts") {
      includeDrafts = true;
    } else if (a === "--no-clean") {
      cleanDestinationDir = false;
    } else if (a === "--clean") {
      cleanDestinationDir = true;
    } else {
      reportUsageError(`Unknown build option: ${a}`);
      return;
    }
  }

  const buildReq = new BuildRequest(buildSourceDir);
  buildReq.destinationDir = buildDestinationDir;
  buildReq.baseURL = buildBaseURL;
  buildReq.themesDir = buildThemesDir;
  buildReq.buildDrafts = includeDrafts;
  buildReq.cleanDestinationDir = cleanDestinationDir;
  buildReq.buildTime = readSourceDateEpoch() ?? buildReq.buildTime;

  const result = buildSite(buildReq);
  logLine(`Built → ${result.outputDir} (${result.pagesBuilt} pages)`);
};
