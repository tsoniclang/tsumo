import { Console, Environment, Int32 } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Tsumo, BuildRequest, ServeRequest } from "@tsumo/engine/Tsumo.Engine.js";
import type { int } from "@tsonic/core/types.js";

const VERSION = "0.0.0";

const usage = (): void => {
  Console.writeLine("tsumo - Hugo-inspired blog engine (Tsonic)");
  Console.writeLine("");
  Console.writeLine("USAGE:");
  Console.writeLine("  tsumo [build] [options]");
  Console.writeLine("  tsumo server [options]");
  Console.writeLine("  tsumo new site <dir>");
  Console.writeLine("  tsumo new <path.md> [--source <dir>]");
  Console.writeLine("  tsumo version");
  Console.writeLine("");
  Console.writeLine("BUILD OPTIONS:");
  Console.writeLine("  -s, --source <dir>         Site directory (default: cwd)");
  Console.writeLine("  -d, --destination <dir>    Output directory (default: public)");
  Console.writeLine("  -D, --buildDrafts          Include drafts");
  Console.writeLine("  --baseURL <url>            Override baseURL");
  Console.writeLine("  --no-clean                 Do not wipe destination dir");
  Console.writeLine("");
  Console.writeLine("SERVER OPTIONS:");
  Console.writeLine("  -s, --source <dir>         Site directory (default: cwd)");
  Console.writeLine("  -p, --port <port>          Port (default: 1313)");
  Console.writeLine("  --host <host>              Host (default: localhost)");
  Console.writeLine("  --watch / --no-watch       Watch and rebuild (default: on)");
  Console.writeLine("  -D, --buildDrafts          Include drafts");
};

const parseInt = (value: string): int | undefined => {
  const parsed: int = 0;
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
    Console.writeLine(VERSION);
    return;
  }

  const cmd = first === "" || first.startsWith("-") ? "build" : first;

  if (cmd === "new") {
    if (args.length >= 2 && args[1] === "site") {
      if (args.length < 3) {
        Console.error.writeLine("Missing <dir> for `tsumo new site`");
        Environment.exitCode = 2;
        return;
      }
      const dir = args[2]!;
      Tsumo.initSite(dir);
      Console.writeLine(`Created site: ${dir}`);
      return;
    }

    if (args.length < 2) {
      Console.error.writeLine("Missing <path.md> for `tsumo new`");
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
    Console.writeLine(`Created content: ${created}`);
    return;
  }

  if (cmd === "server" || cmd === "serve") {
    let serveSourceDir = Environment.currentDirectory;
    let serveDestinationDir = "public";
    let serveBaseURL: string | undefined = undefined;
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
      } else if ((a === "--host" || a === "--bind") && i + 1 < args.length) {
        serveHost = args[i + 1]!;
        i++;
      } else if ((a === "--port" || a === "-p") && i + 1 < args.length) {
        const portText = args[i + 1]!;
        const p = parseInt(portText);
        if (p === undefined) {
          Console.error.writeLine(`Invalid port: ${portText}`);
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
    Console.error.writeLine(`Unknown command: ${cmd}`);
    usage();
    Environment.exitCode = 2;
    return;
  }

  let buildSourceDir = Environment.currentDirectory;
  let buildDestinationDir = "public";
  let buildBaseURL: string | undefined = undefined;
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
  buildReq.buildDrafts = includeDrafts;
  buildReq.cleanDestinationDir = cleanDestinationDir;

  const result = Tsumo.build(buildReq);
  Console.writeLine(`Built → ${result.outputDir} (${result.pagesBuilt} pages)`);
}
