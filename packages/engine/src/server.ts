import { Console } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { HttpListener, HttpListenerContext, HttpListenerResponse } from "@tsonic/dotnet/System.Net.js";
import { FileSystemWatcher, WatcherChangeTypes } from "@tsonic/dotnet/System.IO.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Task } from "@tsonic/dotnet/System.Threading.Tasks.js";
import { Encoding } from "@tsonic/dotnet/System.Text.js";
import type { byte, char, int } from "@tsonic/core/types.js";
import { buildSite } from "./builder.ts";
import { ServeRequest } from "./models.ts";
import { contentTypeForPath } from "./utils/mime.ts";
import { ensureTrailingSlash } from "./utils/text.ts";

const logLine = (message: string): void => {
  Console.writeLine("{0}", message);
};

const logErrorLine = (message: string): void => {
  Console.error.writeLine("{0}", message);
};

const sendText = (response: HttpListenerResponse, statusCode: int, contentType: string, body: string): void => {
  response.statusCode = statusCode;
  response.contentType = contentType;

  const buffer = Encoding.UTF8.getBytes(body);
  const bufferLength = Encoding.UTF8.getByteCount(body);
  response.contentLength64 = bufferLength;

  const output = response.outputStream;
  output.write(buffer, 0, bufferLength);
  output.close();
  response.close();
};

const sendBytes = (response: HttpListenerResponse, statusCode: int, contentType: string, bytes: byte[]): void => {
  response.statusCode = statusCode;
  response.contentType = contentType;
  response.contentLength64 = bytes.length;
  const output = response.outputStream;
  output.write(bytes, 0, bytes.length);
  output.close();
  response.close();
};

const resolveRequestPath = (outDir: string, requestPath: string): string | undefined => {
  const outFull = Path.getFullPath(outDir);
  const outPrefix = outFull.endsWith(Path.directorySeparatorChar) ? outFull : outFull + Path.directorySeparatorChar;
  const slash: char = "/";
  const rel = requestPath.trimStart(slash).replace(slash, Path.directorySeparatorChar);

  if (rel === "" || requestPath.endsWith("/")) {
    const p = Path.getFullPath(Path.combine(outFull, rel, "index.html"));
    if (p.startsWith(outPrefix) && File.exists(p)) return p;
    return undefined;
  }

  const direct = Path.getFullPath(Path.combine(outFull, rel));
  if (direct.startsWith(outPrefix) && File.exists(direct)) return direct;

  if (!Path.hasExtension(rel)) {
    const p = Path.getFullPath(Path.combine(outFull, rel, "index.html"));
    if (p.startsWith(outPrefix) && File.exists(p)) return p;
  }

  return undefined;
};

const handleRequest = (outDir: string, ctx: HttpListenerContext): void => {
  const request = ctx.request;
  const response = ctx.response;
  const url = request.url;
  if (url === undefined) {
    sendText(response, 400, "text/plain; charset=utf-8", "Bad Request");
    return;
  }

  const path = url.absolutePath;
  const filePath = resolveRequestPath(outDir, path);
  if (filePath === undefined) {
    sendText(response, 404, "text/plain; charset=utf-8", "Not Found");
    return;
  }

  const ct = contentTypeForPath(filePath);
  if (ct.startsWith("text/") || ct.startsWith("application/json") || ct.startsWith("application/xml")) {
    const body = File.readAllText(filePath);
    sendText(response, 200, ct, body);
    return;
  }

  const bytes = File.readAllBytes(filePath);
  sendBytes(response, 200, ct, bytes);
};

const createWatcher = (path: string): FileSystemWatcher | undefined => {
  if (!Directory.exists(path)) return undefined;
  const w = new FileSystemWatcher(path);
  w.includeSubdirectories = true;
  w.filter = "*.*";
  w.enableRaisingEvents = true;
  return w;
};

const watchLoop = (req: ServeRequest, outDir: string): void => {
  const siteDir = Path.getFullPath(req.siteDir);
  const watchers = new List<FileSystemWatcher>();

  const content = createWatcher(Path.combine(siteDir, "content"));
  if (content !== undefined) watchers.add(content);
  const layouts = createWatcher(Path.combine(siteDir, "layouts"));
  if (layouts !== undefined) watchers.add(layouts);
  const staticDir = createWatcher(Path.combine(siteDir, "static"));
  if (staticDir !== undefined) watchers.add(staticDir);
  const archetypes = createWatcher(Path.combine(siteDir, "archetypes"));
  if (archetypes !== undefined) watchers.add(archetypes);

  const watcherArr = watchers.toArray();
  if (watcherArr.length === 0) return;

  while (true) {
    let changed = false;
    for (let i = 0; i < watcherArr.length; i++) {
      const res = watcherArr[i]!.waitForChanged(WatcherChangeTypes.all, 250);
      if (!res.timedOut) {
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
  listener.prefixes.add(prefix);
  listener.start();

  logLine("");
  logLine("=================================");
  logLine("  tsumo server");
  logLine(`  Serving: ${result.outputDir}`);
  logLine(`  URL: ${prefix}`);
  logLine("=================================");
  logLine("");
  logLine("Press Ctrl+C to stop");

  if (req.watch) {
    Task.run(() => watchLoop(req, result.outputDir));
  }

  while (true) {
    const ctx = listener.getContext();
    Task.run(() => handleRequest(result.outputDir, ctx));
  }
};
