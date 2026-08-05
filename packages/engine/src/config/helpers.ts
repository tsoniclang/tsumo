import { LanguageConfig } from "../models.js";
import { fileExists } from "../fs.js";
import { substringCount } from "../utils/strings.js";

export const tryGetFirstExisting = (paths: string[]): string | undefined => {
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]!;
    if (fileExists(p)) return p;
  }
  return undefined;
};

export const unquote = (value: string): string => {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) {
    return substringCount(v, 1, v.length - 2);
  }
  return v;
};

export const sortLanguages = (langs: LanguageConfig[]): LanguageConfig[] => {
  const copy: LanguageConfig[] = [];
  for (let i = 0; i < langs.length; i++) copy.push(langs[i]!);
  return copy.sort((a: LanguageConfig, b: LanguageConfig) => a.weight - b.weight);
};
