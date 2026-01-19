import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { LanguageConfig } from "../models.ts";
import { fileExists } from "../fs.ts";

export const tryGetFirstExisting = (paths: string[]): string | undefined => {
  for (let i = 0; i < paths.Length; i++) {
    const p = paths[i]!;
    if (fileExists(p)) return p;
  }
  return undefined;
};

export const unquote = (value: string): string => {
  const v = value.Trim();
  if (v.Length >= 2 && ((v.StartsWith("\"") && v.EndsWith("\"")) || (v.StartsWith("'") && v.EndsWith("'")))) {
    return v.Substring(1, v.Length - 2);
  }
  return v;
};

export const sortLanguages = (langs: LanguageConfig[]): LanguageConfig[] => {
  const copy = new List<LanguageConfig>();
  for (let i = 0; i < langs.Length; i++) copy.Add(langs[i]!);
  copy.Sort((a: LanguageConfig, b: LanguageConfig) => a.weight - b.weight);
  return copy.ToArray();
};
