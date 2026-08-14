import process from "node:process";
import type { int32 } from "@tsonic/core/types.js";

import { ServeRequest, serveSite } from "@tsumo/engine/index.js";

import { parseIntArg } from "../parse-int.js";
import { reportUsageError } from "../report-usage-error.js";
import { readSourceDateEpoch } from "../source-date-epoch.js";

export const handleServe = (args: readonly string[]): void => {
  let serveSourceDir = process.cwd();
  let serveDestinationDir = "public";
  let serveBaseURL: string | undefined = undefined;
  let serveThemesDir: string | undefined = undefined;
  let serveHost = "localhost";
  let servePort: int32 = 1313;
  let serveWatch = true;
  let serveBuildDrafts = false;
  let serveClean = true;

  for (let i = 1; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--source" || a === "-s") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      serveSourceDir = args[i + 1]!;
      i++;
    } else if (a === "--destination" || a === "-d") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      serveDestinationDir = args[i + 1]!;
      i++;
    } else if (a === "--baseURL" || a === "--baseurl") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      serveBaseURL = args[i + 1]!;
      i++;
    } else if (a === "--themesDir" || a === "--themesdir") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      serveThemesDir = args[i + 1]!;
      i++;
    } else if (a === "--host" || a === "--bind") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      serveHost = args[i + 1]!;
      i++;
    } else if (a === "--port" || a === "-p") {
      if (i + 1 >= args.length) {
        reportUsageError(`Missing value for ${a}`);
        return;
      }
      const portText = args[i + 1]!;
      const p = parseIntArg(portText);
      if (p === undefined || p < 1 || p > 65535) {
        reportUsageError(`Invalid port: ${portText}`);
        return;
      }
      servePort = p;
      i++;
    } else if (a === "--watch") {
      serveWatch = true;
    } else if (a === "--no-watch") {
      serveWatch = false;
    } else if (a === "-D" || a === "--buildDrafts") {
      serveBuildDrafts = true;
    } else if (a === "--no-clean") {
      serveClean = false;
    } else if (a === "--clean") {
      serveClean = true;
    } else {
      reportUsageError(`Unknown server option: ${a}`);
      return;
    }
  }

  const serveReq = new ServeRequest(serveSourceDir);
  serveReq.destinationDir = serveDestinationDir;
  serveReq.baseURL = serveBaseURL;
  serveReq.themesDir = serveThemesDir;
  serveReq.host = serveHost;
  serveReq.port = servePort;
  serveReq.watch = serveWatch;
  serveReq.buildDrafts = serveBuildDrafts;
  serveReq.cleanDestinationDir = serveClean;
  serveReq.buildTime = readSourceDateEpoch() ?? serveReq.buildTime;

  serveSite(serveReq);
};
