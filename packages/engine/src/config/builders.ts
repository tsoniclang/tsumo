import type { int32 } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry } from "../models.js";
import { ParamValue } from "../params.js";

export class MenuEntryBuilder {
  name: string;
  url: string;
  pageRef: string;
  title: string;
  weight: int32;
  parent: string;
  identifier: string;
  pre: string;
  post: string;
  menu: string;
  params: Map<string, ParamValue>;

  constructor(menu: string) {
    this.name = "";
    this.url = "";
    this.pageRef = "";
    this.title = "";
    this.weight = 0;
    this.parent = "";
    this.identifier = "";
    this.pre = "";
    this.post = "";
    this.menu = menu;
    this.params = new Map<string, ParamValue>();
  }

  toEntry(): MenuEntry {
    return new MenuEntry(
      this.name,
      this.url,
      this.pageRef,
      this.title,
      this.weight,
      this.parent,
      this.identifier,
      this.pre,
      this.post,
      this.menu,
      this.params,
    );
  }
}

export class LanguageConfigBuilder {
  lang: string;
  languageName: string;
  languageDirection: string;
  contentDir: string;
  weight: int32;

  constructor(lang: string, source?: LanguageConfig) {
    this.lang = lang;
    this.languageName = source?.languageName ?? lang;
    this.languageDirection = source?.languageDirection ?? "ltr";
    this.contentDir = source?.contentDir ?? `content.${lang}`;
    this.weight = source?.weight ?? 0;
  }

  toConfig(): LanguageConfig {
    return new LanguageConfig(this.lang, this.languageName, this.languageDirection, this.contentDir, this.weight);
  }
}
