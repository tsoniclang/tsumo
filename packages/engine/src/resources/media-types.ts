export const resourceMediaTypeForExtension = (extension: string): string => {
  const value = extension.toLowerCase();
  if (value === ".png") return "image/png";
  if (value === ".jpg" || value === ".jpeg") return "image/jpeg";
  if (value === ".gif") return "image/gif";
  if (value === ".webp") return "image/webp";
  if (value === ".svg") return "image/svg+xml";
  if (value === ".ico") return "image/x-icon";
  if (value === ".bmp") return "image/bmp";
  if (value === ".tiff" || value === ".tif") return "image/tiff";
  if (value === ".js" || value === ".mjs") return "application/javascript";
  if (value === ".json") return "application/json";
  if (value === ".yaml" || value === ".yml") return "application/yaml";
  if (value === ".toml") return "application/toml";
  if (value === ".css") return "text/css";
  if (value === ".scss" || value === ".sass") return "text/x-scss";
  if (value === ".html" || value === ".htm") return "text/html";
  if (value === ".xml") return "application/xml";
  if (value === ".txt") return "text/plain";
  if (value === ".woff") return "font/woff";
  if (value === ".woff2") return "font/woff2";
  if (value === ".ttf") return "font/ttf";
  if (value === ".otf") return "font/otf";
  if (value === ".eot") return "application/vnd.ms-fontobject";
  if (value === ".pdf") return "application/pdf";
  if (value === ".zip") return "application/zip";
  return "application/octet-stream";
};

export const isImageResourceExtension = (extension: string): boolean => {
  const value = extension.toLowerCase();
  return value === ".png" ||
    value === ".jpg" ||
    value === ".jpeg" ||
    value === ".gif" ||
    value === ".webp" ||
    value === ".bmp";
};

export const resourceMatchesMediaType = (actual: string, requested: string): boolean => {
  const target = requested.trim().toLowerCase();
  if (target === "") return false;
  const mediaType = actual.toLowerCase();
  return target.includes("/") ? mediaType === target : mediaType.startsWith(target + "/");
};
