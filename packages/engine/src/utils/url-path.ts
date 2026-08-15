import { trimEndChar, trimStartChar } from "./strings.js";

export const combineUrlPath = (parts: string[]): string => {
  const slash = "/";
  const cleaned = parts
    .map((part: string) => trimEndChar(trimStartChar(part.trim(), slash), slash))
    .filter((part: string) => part !== "");
  return cleaned.length === 0 ? "/" : "/" + cleaned.join("/") + "/";
};
