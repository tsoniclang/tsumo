import { Char } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { char } from "@tsonic/core/types.js";

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
  const lower = input.Trim().ToLowerInvariant();
  const chars: char[] = lower.ToCharArray();
  const sb = new StringBuilder();
  let wroteDash = false;

  for (let i = 0; i < chars.Length; i++) {
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
  while (out.StartsWith("-")) out = out.Substring(1);
  while (out.EndsWith("-")) out = out.Substring(0, out.Length - 1);
  return out;
};

export const humanizeSlug = (slug: string): string => {
  const parts = slug
    .Replace("_", "-")
    .Replace(".", "-")
    .Split("-");

  const words = new StringBuilder();
  for (let i = 0; i < parts.Length; i++) {
    const partRaw = parts[i];
    if (partRaw === undefined) continue;
    const part = partRaw.Trim();
    if (part === "") continue;
    const w = part.Substring(0, 1).ToUpperInvariant() + part.Substring(1);
    if (words.Length > 0) words.Append(" ");
    words.Append(w);
  }
  return words.ToString();
};

export const ensureTrailingSlash = (url: string): string => {
  if (url === "") return url;
  return url.EndsWith("/") ? url : url + "/";
};

export const ensureLeadingSlash = (url: string): string => {
  const trimmed = url.Trim();
  if (trimmed === "") return "/";
  return trimmed.StartsWith("/") ? trimmed : "/" + trimmed;
};
