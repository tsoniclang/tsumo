import { Console } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { HttpListener, HttpListenerContext, HttpListenerResponse } from "@tsonic/dotnet/System.Net.js";
import { ThreadPool } from "@tsonic/dotnet/System.Threading.js";
import { FileSystemWatcher, WatcherChangeTypes } from "@tsonic/dotnet/System.IO.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Encoding } from "@tsonic/dotnet/System.Text.js";
import type { byte, char, int } from "@tsonic/core/types.js";
import { buildSite } from "./build-site.ts";
import { loadDocsConfig } from "./docs/config.ts";
import { ServeRequest } from "./models.ts";
import { contentTypeForPath } from "./utils/mime.ts";
import { ensureTrailingSlash } from "./utils/text.ts";
import { replaceText, trimStartChar } from "./utils/strings.ts";

const logLine = (message: string): void => {
  Console.WriteLine("{0}", message);
};

const logErrorLine = (message: string): void => {
  Console.Error.WriteLine("{0}", message);
};

const sendText = (response: HttpListenerResponse, statusCode: int, contentType: string, body: string): void => {
  response.StatusCode = statusCode;
  response.ContentType = contentType;

  const buffer = Encoding.UTF8.GetBytes(body);
  const bufferLength = Encoding.UTF8.GetByteCount(body);
  response.ContentLength64 = bufferLength;

  const output = response.OutputStream;
  output.Write(buffer, 0, bufferLength);
  output.Close();
  response.Close();
};

const sendBytes = (response: HttpListenerResponse, statusCode: int, contentType: string, bytes: byte[]): void => {
  response.StatusCode = statusCode;
  response.ContentType = contentType;
  response.ContentLength64 = bytes.length;
  const output = response.OutputStream;
  output.Write(bytes, 0, bytes.length);
  output.Close();
  response.Close();
};

const resolveRequestPath = (outDir: string, requestPath: string): string | undefined => {
  const outFull = Path.GetFullPath(outDir);
  const dirSeparator = `${Path.DirectorySeparatorChar}`;
  const outPrefix = outFull.endsWith(dirSeparator) ? outFull : outFull + dirSeparator;
  const slash = "/";
  const rel = replaceText(
    trimStartChar(requestPath, slash),
    slash,
    `${Path.DirectorySeparatorChar}`
  );

  if (rel === "" || requestPath.endsWith("/")) {
    const p = Path.GetFullPath(Path.Combine(outFull, rel, "index.html"));
    if (p.startsWith(outPrefix) && File.Exists(p)) return p;
    return undefined;
  }

  const direct = Path.GetFullPath(Path.Combine(outFull, rel));
  if (direct.startsWith(outPrefix) && File.Exists(direct)) return direct;

  if (!Path.HasExtension(rel)) {
    const p = Path.GetFullPath(Path.Combine(outFull, rel, "index.html"));
    if (p.startsWith(outPrefix) && File.Exists(p)) return p;
  }

  return undefined;
};

const handleRequest = (outDir: string, ctx: HttpListenerContext): void => {
  const request = ctx.Request;
  const response = ctx.Response;
  const url = request.Url;
  if (url === undefined) {
    sendText(response, 400, "text/plain; charset=utf-8", "Bad Request");
    return;
  }

  const path = url.AbsolutePath;
  const filePath = resolveRequestPath(outDir, path);
  if (filePath === undefined) {
    sendText(response, 404, "text/plain; charset=utf-8", "Not Found");
    return;
  }

  const ct = contentTypeForPath(filePath);
  if (ct.startsWith("text/") || ct.startsWith("application/json") || ct.startsWith("application/xml")) {
    const body = File.ReadAllText(filePath);
    sendText(response, 200, ct, body);
    return;
  }

  const bytes = File.ReadAllBytes(filePath);
  sendBytes(response, 200, ct, bytes);
};

const createWatcher = (path: string, filter: string, includeSubdirectories: boolean): FileSystemWatcher | undefined => {
  if (!Directory.Exists(path)) return undefined;
  const w = new FileSystemWatcher(path);
  w.IncludeSubdirectories = includeSubdirectories;
  w.Filter = filter;
  w.EnableRaisingEvents = true;
  return w;
};

const watchLoop = (req: ServeRequest, outDir: string): void => {
  const siteDir = Path.GetFullPath(req.siteDir);
  const watchers = new List<FileSystemWatcher>();

  const docsConfig = loadDocsConfig(siteDir);

  if (docsConfig === undefined) {
    const content = createWatcher(Path.Combine(siteDir, "content"), "*.*", true);
    if (content !== undefined) watchers.Add(content);
    const archetypes = createWatcher(Path.Combine(siteDir, "archetypes"), "*.*", true);
    if (archetypes !== undefined) watchers.Add(archetypes);
  } else {
    const mounts = docsConfig.config.mounts;
    for (let i = 0; i < mounts.length; i++) {
      const m = mounts[i]!;
      const w = createWatcher(m.sourceDir, "*.*", true);
      if (w !== undefined) watchers.Add(w);
    }
    const docsCfg = createWatcher(siteDir, "tsumo.docs.json", false);
    if (docsCfg !== undefined) watchers.Add(docsCfg);
  }

  const layouts = createWatcher(Path.Combine(siteDir, "layouts"), "*.*", true);
  if (layouts !== undefined) watchers.Add(layouts);
  const staticDir = createWatcher(Path.Combine(siteDir, "static"), "*.*", true);
  if (staticDir !== undefined) watchers.Add(staticDir);

  const watcherArr = watchers.ToArray();
  if (watcherArr.length === 0) return;

  while (true) {
    let changed = false;
    for (let i = 0; i < watcherArr.length; i++) {
      const res = watcherArr[i]!.WaitForChanged(WatcherChangeTypes.All, 250);
      if (!res.TimedOut) {
        changed = true;
        break;
      }
    }

    if (!changed) continue;

    try {
      buildSite(req);
      logLine(`[tsumo] rebuilt → ${outDir}`);
    } catch {
      logErrorLine("[tsumo] rebuild failed");
    }
  }
};

export const serveSite = (req: ServeRequest): void => {
  const host = req.host.trim() === "" ? "localhost" : req.host.trim();
  const port = req.port;
  const prefix = `http://${host}:${port}/`;

  if (req.baseURL === undefined || req.baseURL.trim() === "") {
    req.baseURL = ensureTrailingSlash(prefix);
  }

  const result = buildSite(req);

  const listener = new HttpListener();
  listener.Prefixes.Add(prefix);
  listener.Start();

  logLine("");
  logLine("=================================");
  logLine("  tsumo server");
  logLine(`  Serving: ${result.outputDir}`);
  logLine(`  URL: ${prefix}`);
  logLine("=================================");
  logLine("");
  logLine("Press Ctrl+C to stop");

  if (req.watch) {
    ThreadPool.QueueUserWorkItem((_state: unknown) => watchLoop(req, result.outputDir));
  }

  while (true) {
    const ctx = listener.GetContext();
    ThreadPool.QueueUserWorkItem((_state: unknown) =>
      handleRequest(result.outputDir, ctx)
    );
  }
};
