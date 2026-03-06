import { Char } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { char } from "@tsonic/core/types.js";
import { replaceText, substringCount, trimEndChar, toChars } from "./strings.ts";

const wordSeparatorSpace: char = " ";
const wordSeparatorDash: char = "-";
const wordSeparatorUnderscore: char = "_";
const wordSeparatorDot: char = ".";
const wordSeparatorSlash: char = "/";

const isWordSeparator = (ch: char): boolean =>
  ch === wordSeparatorSpace ||
  ch === wordSeparatorDash ||
  ch === wordSeparatorUnderscore ||
  ch === wordSeparatorDot ||
  ch === wordSeparatorSlash;

export const slugify = (input: string): string => {
  const lower = input.trim().toLowerCase();
  const chars = toChars(lower);
  const sb = new StringBuilder();
  let wroteDash = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (Char.IsLetterOrDigit(ch)) {
      sb.Append(ch);
      wroteDash = false;
      continue;
    }
    if (isWordSeparator(ch)) {
      if (sb.Length > 0 && !wroteDash) {
        sb.Append(wordSeparatorDash);
        wroteDash = true;
      }
    }
  }

  let out = sb.ToString();
  while (out.startsWith("-")) out = out.substring(1);
  out = trimEndChar(out, "-");
  return out;
};

export const humanizeSlug = (slug: string): string => {
  const parts = replaceText(replaceText(slug, "_", "-"), ".", "-").split("-");

  const words = new StringBuilder();
  for (let i = 0; i < parts.length; i++) {
    const partRaw = parts[i];
    if (partRaw === undefined) continue;
    const part = partRaw.trim();
    if (part === "") continue;
    const w = substringCount(part, 0, 1).toUpperCase() + part.substring(1);
    if (words.Length > 0) words.Append(" ");
    words.Append(w);
  }
  return words.ToString();
};

export const ensureTrailingSlash = (url: string): string => {
  if (url === "") return url;
  return url.endsWith("/") ? url : url + "/";
};

export const ensureLeadingSlash = (url: string): string => {
  const trimmed = url.trim();
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
};
