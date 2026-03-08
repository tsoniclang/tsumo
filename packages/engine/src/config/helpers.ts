import { LanguageConfig } from "../models.ts";
import { fileExists } from "../fs.ts";
import { substringCount } from "../utils/strings.ts";

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
  return [...langs].sort((a: LanguageConfig, b: LanguageConfig) => a.weight - b.weight);
};
