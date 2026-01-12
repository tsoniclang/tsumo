import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { LanguageConfig } from "../models.ts";
import { fileExists } from "../fs.ts";

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
    return v.substring(1, v.length - 2);
  }
  return v;
};

export const sortLanguages = (langs: LanguageConfig[]): LanguageConfig[] => {
  const copy = new List<LanguageConfig>();
  for (let i = 0; i < langs.length; i++) copy.add(langs[i]!);
  copy.sort((a: LanguageConfig, b: LanguageConfig) => a.weight - b.weight);
  return copy.toArray();
};
