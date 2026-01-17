import { Console, Environment, Int32 } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Tsumo, BuildRequest, ServeRequest } from "tsumo-engine-types/Tsumo.Engine.js";
import type { int } from "@tsonic/core/types.js";

const VERSION = "0.0.0";

const logLine = (message: string): void => {
  Console.writeLine("{0}", message);
};

const logErrorLine = (message: string): void => {
  Console.error.writeLine("{0}", message);
};

const usage = (): void => {
  logLine("tsumo - Hugo-inspired blog engine (Tsonic)");
  logLine("");
  logLine("USAGE:");
  logLine("  tsumo [build] [options]");
  logLine("  tsumo server [options]");
  logLine("  tsumo new site <dir>");
  logLine("  tsumo new <path.md> [--source <dir>]");
  logLine("  tsumo version");
  logLine("");
  logLine("BUILD OPTIONS:");
  logLine("  -s, --source <dir>         Site directory (default: cwd)");
  logLine("  -d, --destination <dir>    Output directory (default: public)");
  logLine("  -D, --buildDrafts          Include drafts");
  logLine("  --baseURL <url>            Override baseURL");
  logLine("  --themesDir <dir>          Themes directory (like Hugo --themesDir)");
  logLine("  --no-clean                 Do not wipe destination dir");
  logLine("");
  logLine("SERVER OPTIONS:");
  logLine("  -s, --source <dir>         Site directory (default: cwd)");
  logLine("  -p, --port <port>          Port (default: 1313)");
  logLine("  --host <host>              Host (default: localhost)");
  logLine("  --watch / --no-watch       Watch and rebuild (default: on)");
  logLine("  -D, --buildDrafts          Include drafts");
  logLine("  --themesDir <dir>          Themes directory (like Hugo --themesDir)");
};

const parseInt = (value: string): int | undefined => {
  let parsed: int = 0;
  const ok = Int32.tryParse(value, parsed);
  return ok ? parsed : undefined;
};

export function main(): void {
  const argv = Environment.getCommandLineArgs();
  const argsList = new List<string>();
  for (let i = 1; i < argv.length; i++) argsList.add(argv[i]!);
  const args = argsList.toArray();

  const first = args.length > 0 ? args[0]! : "";
  if (first === "-h" || first === "--help" || first === "help") {
    usage();
    return;
  }

  if (first === "-v" || first === "--version" || first === "version") {
    logLine(VERSION);
    return;
  }

  const cmd = first === "" || first.startsWith("-") ? "build" : first;

  if (cmd === "new") {
    if (args.length >= 2 && args[1] === "site") {
      if (args.length < 3) {
        logErrorLine("Missing <dir> for `tsumo new site`");
        Environment.exitCode = 2;
        return;
      }
      const dir = args[2]!;
      Tsumo.initSite(dir);
      logLine(`Created site: ${dir}`);
      return;
    }

    if (args.length < 2) {
      logErrorLine("Missing <path.md> for `tsumo new`");
      Environment.exitCode = 2;
      return;
    }

    let contentSourceDir = Environment.currentDirectory;
    for (let i = 2; i < args.length; i++) {
      const a = args[i]!;
      if ((a === "--source" || a === "-s") && i + 1 < args.length) {
        contentSourceDir = args[i + 1]!;
        i++;
      }
    }

    const created = Tsumo.newContent(contentSourceDir, args[1]!);
    logLine(`Created content: ${created}`);
    return;
  }

  if (cmd === "server" || cmd === "serve") {
    let serveSourceDir = Environment.currentDirectory;
    let serveDestinationDir = "public";
    let serveBaseURL: string | undefined = undefined;
    let serveThemesDir: string | undefined = undefined;
    let serveHost = "localhost";
    let servePort: int = 1313;
    let serveWatch = true;
    let serveBuildDrafts = false;
    let serveClean = true;

    for (let i = 1; i < args.length; i++) {
      const a = args[i]!;
      if ((a === "--source" || a === "-s") && i + 1 < args.length) {
        serveSourceDir = args[i + 1]!;
        i++;
      } else if ((a === "--destination" || a === "-d") && i + 1 < args.length) {
        serveDestinationDir = args[i + 1]!;
        i++;
      } else if ((a === "--baseURL" || a === "--baseurl") && i + 1 < args.length) {
        serveBaseURL = args[i + 1]!;
        i++;
      } else if ((a === "--themesDir" || a === "--themesdir") && i + 1 < args.length) {
        serveThemesDir = args[i + 1]!;
        i++;
      } else if ((a === "--host" || a === "--bind") && i + 1 < args.length) {
        serveHost = args[i + 1]!;
        i++;
      } else if ((a === "--port" || a === "-p") && i + 1 < args.length) {
        const portText = args[i + 1]!;
        const p = parseInt(portText);
        if (p === undefined) {
          logErrorLine(`Invalid port: ${portText}`);
          Environment.exitCode = 2;
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

    Tsumo.serve(serveReq);
    return;
  }

  if (cmd === "build" || cmd === "gen" || cmd === "generate") {
    // fall through to build handler
  } else {
    logErrorLine(`Unknown command: ${cmd}`);
    usage();
    Environment.exitCode = 2;
    return;
  }

  let buildSourceDir = Environment.currentDirectory;
  let buildDestinationDir = "public";
  let buildBaseURL: string | undefined = undefined;
  let buildThemesDir: string | undefined = undefined;
  let includeDrafts = false;
  let cleanDestinationDir = true;

  const buildArgStart = first === "build" || first === "gen" || first === "generate" ? 1 : 0;
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

  const result = Tsumo.build(buildReq);
  logLine(`Built → ${result.outputDir} (${result.pagesBuilt} pages)`);
}
