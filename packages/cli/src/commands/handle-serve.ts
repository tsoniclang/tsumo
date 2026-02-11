import { Environment } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/core/types.js";

import { ServeRequest, servesite } from "@tsumo/engine/Tsumo.Engine.js";

import { logErrorLine } from "../log-error-line.ts";
import { parseIntArg } from "../parse-int.ts";

export const handleServe = (args: readonly string[]): void => {
  let serveSourceDir = Environment.CurrentDirectory;
  let serveDestinationDir = "public";
  let serveBaseURL: string | undefined = undefined;
  let serveThemesDir: string | undefined = undefined;
  let serveHost = "localhost";
  let servePort: int = 1313;
  let serveWatch = true;
  let serveBuildDrafts = false;
  let serveClean = true;

  for (let i = 1; i < args.Length; i++) {
    const a = args[i]!;
    if ((a === "--source" || a === "-s") && i + 1 < args.Length) {
      serveSourceDir = args[i + 1]!;
      i++;
    } else if ((a === "--destination" || a === "-d") && i + 1 < args.Length) {
      serveDestinationDir = args[i + 1]!;
      i++;
    } else if ((a === "--baseURL" || a === "--baseurl") && i + 1 < args.Length) {
      serveBaseURL = args[i + 1]!;
      i++;
    } else if ((a === "--themesDir" || a === "--themesdir") && i + 1 < args.Length) {
      serveThemesDir = args[i + 1]!;
      i++;
    } else if ((a === "--host" || a === "--bind") && i + 1 < args.Length) {
      serveHost = args[i + 1]!;
      i++;
    } else if ((a === "--port" || a === "-p") && i + 1 < args.Length) {
      const portText = args[i + 1]!;
      const p = parseIntArg(portText);
      if (p === undefined) {
        logErrorLine(`Invalid port: ${portText}`);
        Environment.ExitCode = 2;
        return;
      }
      servePort = p;
      i++;
    } else if (a === "--watch") {
      serveWatch = true;
    } else if (a === "--no-watch") {
      serveWatch = false;
    } else if (a === "-D" || a === "--buildDrafts" || a === "--buildDrafts") {
      serveBuildDrafts = true;
    } else if (a === "--no-clean") {
      serveClean = false;
    } else if (a === "--clean") {
      serveClean = true;
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

  servesite.serveSite(serveReq);
};
