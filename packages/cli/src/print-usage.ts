import { logLine } from "./log-line.ts";

export const printUsage = (): void => {
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

