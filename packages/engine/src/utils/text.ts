import { Char } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { char } from "@tsonic/core/types.js";

const wordSeparatorSpace: char = Char.parse(" ");
const wordSeparatorDash: char = Char.parse("-");
const wordSeparatorUnderscore: char = Char.parse("_");
const wordSeparatorDot: char = Char.parse(".");
const wordSeparatorSlash: char = Char.parse("/");

const isWordSeparator = (ch: char): boolean =>
  ch === wordSeparatorSpace ||
  ch === wordSeparatorDash ||
  ch === wordSeparatorUnderscore ||
  ch === wordSeparatorDot ||
  ch === wordSeparatorSlash;

export const slugify = (input: string): string => {
  const lower = input.trim().toLowerInvariant();
  const chars: char[] = lower.toCharArray();
  const sb = new StringBuilder();
  let wroteDash = false;

  for (let i = 0; i < chars.length; i++) {
    const ch: char = chars[i]!;
    if (Char.isLetterOrDigit(ch)) {
      sb.append(ch);
      wroteDash = false;
      continue;
    }
    if (isWordSeparator(ch)) {
      if (sb.length > 0 && !wroteDash) {
        sb.append(wordSeparatorDash);
        wroteDash = true;
      }
    }
  }

  let out = sb.toString();
  while (out.startsWith("-")) out = out.substring(1);
  while (out.endsWith("-")) out = out.substring(0, out.length - 1);
  return out;
};

export const humanizeSlug = (slug: string): string => {
  const parts = slug
    .replace("_", "-")
    .replace(".", "-")
    .split("-");

  const words = new StringBuilder();
  for (let i = 0; i < parts.length; i++) {
    const partRaw = parts[i];
    if (partRaw === undefined) continue;
    const part = partRaw.trim();
    if (part === "") continue;
    const w = part.substring(0, 1).toUpperInvariant() + part.substring(1);
    if (words.length > 0) words.append(" ");
    words.append(w);
  }
  return words.toString();
};

export const ensureTrailingSlash = (url: string): string => {
  if (url === "") return url;
  return url.endsWith("/") ? url : url + "/";
};
