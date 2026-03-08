import type { char } from "@tsonic/core/types.js";
import { replaceText, substringCount, trimEndChar, toChars } from "./strings.ts";

const wordSeparatorSpace: char = " ";
const wordSeparatorDash: char = "-";
const wordSeparatorUnderscore: char = "_";
const wordSeparatorDot: char = ".";
const wordSeparatorSlash: char = "/";

const isWordSeparator = (ch: char): boolean => {
  return (
    ch === wordSeparatorSpace ||
    ch === wordSeparatorDash ||
    ch === wordSeparatorUnderscore ||
    ch === wordSeparatorDot ||
    ch === wordSeparatorSlash
  );
};

export const slugify = (input: string): string => {
  const lower = input.trim().toLowerCase();
  const chars = toChars(lower);
  const output: string[] = [];
  let wroteDash = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const isAlphaNumeric = /^[a-z0-9]$/i.test(ch);
    if (isAlphaNumeric) {
      output.push(ch);
      wroteDash = false;
      continue;
    }
    if (isWordSeparator(ch) && output.length > 0 && !wroteDash) {
      output.push(wordSeparatorDash);
      wroteDash = true;
    }
  }

  let out = output.join("");
  while (out.startsWith("-")) out = out.substring(1);
  return trimEndChar(out, "-");
};

export const humanizeSlug = (slug: string): string => {
  const parts = replaceText(replaceText(slug, "_", "-"), ".", "-").split("-");
  const words: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const partRaw = parts[i];
    if (partRaw === undefined) continue;
    const part = partRaw.trim();
    if (part === "") continue;
    words.push(substringCount(part, 0, 1).toUpperCase() + part.substring(1));
  }

  return words.join(" ");
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
