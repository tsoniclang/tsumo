import { LanguageConfig } from "../models.js";
import { fileExists } from "../fs.js";
import { compareText } from "../utils/strings.js";

export const tryGetFirstExisting = (paths: string[]): string | undefined => {
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]!;
    if (fileExists(p)) return p;
  }
  return undefined;
};

export const sortLanguages = (langs: LanguageConfig[]): LanguageConfig[] => {
  const copy: LanguageConfig[] = [];
  for (let i = 0; i < langs.length; i++) copy.push(langs[i]!);
  return copy.sort((a: LanguageConfig, b: LanguageConfig) => {
    const byWeight = a.weight - b.weight;
    return byWeight !== 0 ? byWeight : compareText(a.lang, b.lang);
  });
};
