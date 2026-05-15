import type { int } from "@tsonic/core/types.js";

export class LanguageConfig {
  lang: string;
  languageName: string;
  languageDirection: string;
  contentDir: string;
  weight: int;

  constructor(lang: string, languageName: string, languageDirection: string, contentDir: string, weight: int) {
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
