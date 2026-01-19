export const contentTypeForPath = (path: string): string => {
  const lower = path.ToLowerInvariant();

  if (lower.EndsWith(".html") || lower.EndsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.EndsWith(".css")) return "text/css; charset=utf-8";
  if (lower.EndsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.EndsWith(".json")) return "application/json; charset=utf-8";
  if (lower.EndsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.EndsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.EndsWith(".svg")) return "image/svg+xml";
  if (lower.EndsWith(".png")) return "image/png";
  if (lower.EndsWith(".jpg") || lower.EndsWith(".jpeg")) return "image/jpeg";
  if (lower.EndsWith(".gif")) return "image/gif";
  if (lower.EndsWith(".webp")) return "image/webp";
  if (lower.EndsWith(".ico")) return "image/x-icon";
  if (lower.EndsWith(".woff")) return "font/woff";
  if (lower.EndsWith(".woff2")) return "font/woff2";

  return "application/octet-stream";
};
