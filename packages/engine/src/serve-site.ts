import { Buffer } from "node:buffer";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { int32 } from "@tsonic/core/types.js";
import { buildSite } from "./build-site.js";
import { loadDocsConfig } from "./docs/config.js";
import { fileExists, readBinaryFile, readTextFile } from "./fs.js";
import { ServeRequest } from "./models.js";
import { contentTypeForPath } from "./utils/mime.js";
import { ensureTrailingSlash } from "./utils/text.js";
import { TsumoError } from "./diagnostics.js";
import { createWatchSnapshot, watchSnapshotsEqual } from "./watch-snapshot.js";

const logLine = (message: string): void => {
  console.log(message);
};

const logErrorLine = (message: string): void => {
  console.error(message);
};

const sendText = (response: ServerResponse, statusCode: int32, contentType: string, body: string): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(body);
};

const sendBytes = (response: ServerResponse, statusCode: int32, contentType: string, bytes: Buffer): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(bytes);
};

const isTextLikeContentType = (contentType: string): boolean => {
  return (
    contentType.startsWith("text/") ||
    contentType.startsWith("application/json") ||
    contentType.startsWith("application/xml") ||
    contentType.endsWith("+xml")
  );
};

const getRequestPath = (request: IncomingMessage): string => {
  const raw = request.url ?? "/";
  const queryIndex = raw.indexOf("?");
  const hashIndex = raw.indexOf("#");
  let end = raw.length;
  if (queryIndex >= 0 && queryIndex < end) end = queryIndex;
  if (hashIndex >= 0 && hashIndex < end) end = hashIndex;
  const path = raw.substring(0, end);
  return path === "" ? "/" : path;
};

const safeResolveUnderRoot = (rootDir: string, requestPath: string, suffixRaw?: string): string | undefined => {
  const suffix = suffixRaw;
  const rootFull = resolve(rootDir);
  const prefix = rootFull.endsWith(sep) ? rootFull : rootFull + sep;
  const candidate = suffix === undefined
    ? resolve(rootFull, "." + requestPath)
    : resolve(rootFull, "." + requestPath, suffix);
  if (candidate !== rootFull && !candidate.startsWith(prefix)) {
    return undefined;
  }
  return candidate;
};

const resolveRequestPath = (outDir: string, requestPath: string): string | undefined => {
  if (requestPath === "/" || requestPath.endsWith("/")) {
    const indexPath = safeResolveUnderRoot(outDir, requestPath, "index.html");
    return indexPath !== undefined && fileExists(indexPath) ? indexPath : undefined;
  }

  const directPath = safeResolveUnderRoot(outDir, requestPath);
  if (directPath !== undefined && fileExists(directPath)) {
    return directPath;
  }

  if (extname(requestPath) === "") {
    const indexPath = safeResolveUnderRoot(outDir, requestPath, "index.html");
    if (indexPath !== undefined && fileExists(indexPath)) {
      return indexPath;
    }
  }

  return undefined;
};

const handleRequest = (outDir: string, request: IncomingMessage, response: ServerResponse): void => {
  const requestPath = getRequestPath(request);
  const filePath = resolveRequestPath(outDir, requestPath);
  if (filePath === undefined) {
    sendText(response, 404, "text/plain; charset=utf-8", "Not Found");
    return;
  }

  const contentType = contentTypeForPath(filePath);
  if (isTextLikeContentType(contentType)) {
    sendText(response, 200, contentType, readTextFile(filePath));
    return;
  }

  sendBytes(response, 200, contentType, readBinaryFile(filePath));
};

const collectWatchTargets = (req: ServeRequest): string[] => {
  const siteDir = resolve(req.siteDir);
  const targets: string[] = [];
  const docsConfig = loadDocsConfig(siteDir);

  if (docsConfig === undefined) {
    targets.push(resolve(siteDir, "content"));
    targets.push(resolve(siteDir, "archetypes"));
  } else {
    const mounts = docsConfig.config.mounts;
    for (let i = 0; i < mounts.length; i++) {
      targets.push(resolve(mounts[i]!.sourceDir));
    }
    targets.push(resolve(siteDir, "tsumo.docs.json"));
  }

  targets.push(resolve(siteDir, "layouts"));
  targets.push(resolve(siteDir, "static"));
  return targets;
};

const startWatchLoop = (req: ServeRequest, onRebuild: (outputDir: string) => void): void => {
  const targets = collectWatchTargets(req);
  let snapshot = createWatchSnapshot(targets);
  let rebuilding = false;

  setInterval(() => {
    if (rebuilding) return;

    const next = createWatchSnapshot(targets);
    if (watchSnapshotsEqual(snapshot, next)) return;

    snapshot = next;
    rebuilding = true;
    try {
      const result = buildSite(req);
      onRebuild(result.outputDir);
      logLine(`[tsumo] rebuilt → ${result.outputDir}`);
    } catch (error) {
      const message = error instanceof TsumoError ? error.diagnostic.format() : `${error}`;
      logErrorLine(`[tsumo] rebuild failed: ${message}`);
    } finally {
      rebuilding = false;
    }
  }, 250 as int32);
};

export const serveSite = (req: ServeRequest): void => {
  const host = req.host.trim() === "" ? "localhost" : req.host.trim();
  const port = req.port;
  const prefix = `http://${host}:${port}/`;

  const baseURL = req.baseURL;
  if (baseURL === undefined || baseURL.trim() === "") {
    req.baseURL = ensureTrailingSlash(prefix);
  }

  let outputDir = buildSite(req).outputDir;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    handleRequest(outputDir, request, response);
  });

  server.listen(port, host, () => {
    logLine("");
    logLine("=================================");
    logLine("  tsumo server");
    logLine(`  Serving: ${outputDir}`);
    logLine(`  URL: ${prefix}`);
    logLine("=================================");
    logLine("");
    logLine("Press Ctrl+C to stop");
  });

  if (req.watch) {
    startWatchLoop(req, (rebuiltOutputDir: string) => {
      outputDir = rebuiltOutputDir;
    });
  }
};
