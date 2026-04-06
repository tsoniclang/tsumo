import { readFileSync, readFileSyncBytes, statSync } from "@tsonic/nodejs/fs.js";
import { createServer, type IncomingMessage, type ServerResponse } from "@tsonic/nodejs/http.js";
import { extname, resolve, sep } from "@tsonic/nodejs/path.js";
import type { byte, int } from "@tsonic/core/types.js";
import { buildSite } from "./build-site.ts";
import { loadDocsConfig } from "./docs/config.ts";
import { dirExists, fileExists, listFilesRecursive } from "./fs.ts";
import { ServeRequest } from "./models.ts";
import { contentTypeForPath } from "./utils/mime.ts";
import { ensureTrailingSlash } from "./utils/text.ts";

const logLine = (message: string): void => {
  console.log(message);
};

const logErrorLine = (message: string): void => {
  console.error(message);
};

const sendText = (response: ServerResponse, statusCode: int, contentType: string, body: string): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", contentType);
  response.end(body);
};

const sendBytes = (response: ServerResponse, statusCode: int, contentType: string, bytes: byte[]): void => {
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

const safeResolveUnderRoot = (rootDir: string, requestPath: string, suffix?: string): string | undefined => {
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
    sendText(response, 200, contentType, readFileSync(filePath, "utf-8"));
    return;
  }

  sendBytes(response, 200, contentType, readFileSyncBytes(filePath));
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

const createWatchSnapshot = (targets: string[]): Map<string, number> => {
  const snapshot = new Map<string, number>();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    if (fileExists(target)) {
      snapshot.set(target, statSync(target).mtimeMs);
      continue;
    }
    if (!dirExists(target)) {
      continue;
    }

    const files = listFilesRecursive(target, "*");
    for (let j = 0; j < files.length; j++) {
      const filePath = files[j]!;
      snapshot.set(filePath, statSync(filePath).mtimeMs);
    }
  }

  return snapshot;
};

const snapshotsEqual = (left: Map<string, number>, right: Map<string, number>): boolean => {
  if (left.size !== right.size) return false;
  for (const [filePath, stamp] of left.entries()) {
    if (right.get(filePath) !== stamp) return false;
  }
  return true;
};

const startWatchLoop = (req: ServeRequest, onRebuild: (outputDir: string) => void): void => {
  const targets = collectWatchTargets(req);
  let snapshot = createWatchSnapshot(targets);
  let rebuilding = false;

  setInterval(() => {
    if (rebuilding) return;

    const next = createWatchSnapshot(targets);
    if (snapshotsEqual(snapshot, next)) return;

    snapshot = next;
    rebuilding = true;
    try {
      const result = buildSite(req);
      onRebuild(result.outputDir);
      logLine(`[tsumo] rebuilt → ${result.outputDir}`);
    } catch {
      logErrorLine("[tsumo] rebuild failed");
    } finally {
      rebuilding = false;
    }
  }, 250 as int);
};

export const serveSite = (req: ServeRequest): void => {
  const host = req.host.trim() === "" ? "localhost" : req.host.trim();
  const port = req.port;
  const prefix = `http://${host}:${port}/`;

  if (req.baseURL === undefined || req.baseURL.trim() === "") {
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
