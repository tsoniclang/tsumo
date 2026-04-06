import { process } from "@tsonic/nodejs/process.js";
import type { int } from "@tsonic/core/types.js";

import { BuildRequest, buildSite } from "@tsumo/engine/index.js";

import { logLine } from "../log-line.ts";

export const handleBuild = (args: readonly string[], buildArgStart: int): void => {
  let buildSourceDir = process.cwd();
  let buildDestinationDir = "public";
  let buildBaseURL: string | undefined = undefined;
  let buildThemesDir: string | undefined = undefined;
  let includeDrafts = false;
  let cleanDestinationDir = true;

  for (let i = buildArgStart; i < args.length; i++) {
    const a = args[i]!;
    if ((a === "--source" || a === "-s") && i + 1 < args.length) {
      buildSourceDir = args[i + 1]!;
      i++;
    } else if ((a === "--destination" || a === "-d") && i + 1 < args.length) {
      buildDestinationDir = args[i + 1]!;
      i++;
    } else if ((a === "--baseURL" || a === "--baseurl") && i + 1 < args.length) {
      buildBaseURL = args[i + 1]!;
      i++;
    } else if ((a === "--themesDir" || a === "--themesdir") && i + 1 < args.length) {
      buildThemesDir = args[i + 1]!;
      i++;
    } else if (a === "-D" || a === "--buildDrafts" || a === "--buildDrafts") {
      includeDrafts = true;
    } else if (a === "--no-clean") {
      cleanDestinationDir = false;
    } else if (a === "--clean") {
      cleanDestinationDir = true;
    }
  }

  const buildReq = new BuildRequest(buildSourceDir);
  buildReq.destinationDir = buildDestinationDir;
  buildReq.baseURL = buildBaseURL;
  buildReq.themesDir = buildThemesDir;
  buildReq.buildDrafts = includeDrafts;
  buildReq.cleanDestinationDir = cleanDestinationDir;

  const result = buildSite(buildReq);
  logLine(`Built → ${result.outputDir} (${result.pagesBuilt} pages)`);
};
