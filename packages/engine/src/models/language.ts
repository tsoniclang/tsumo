import type { int32 } from "@tsonic/core/types.js";

export class LanguageConfig {
  lang: string;
  languageName: string;
  languageDirection: string;
  contentDir: string;
  weight: int32;

  constructor(lang: string, languageName: string, languageDirection: string, contentDir: string, weight: int32) {
    this.lang = lang;
    this.languageName = languageName;
    this.languageDirection = languageDirection;
    this.contentDir = contentDir;
    this.weight = weight;
  }
}

export class LanguageContext {
  Lang: string;
  LanguageName: string;
  LanguageDirection: string;

  constructor(lang: string, languageName: string, languageDirection: string) {
    this.Lang = lang;
    this.LanguageName = languageName;
    this.LanguageDirection = languageDirection;
  }
}
