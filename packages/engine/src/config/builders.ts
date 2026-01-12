import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry } from "../models.ts";
import { ParamValue } from "../params.ts";

export class MenuEntryBuilder {
  name: string;
  url: string;
  pageRef: string;
  title: string;
  weight: int;
  parent: string;
  identifier: string;
  pre: string;
  post: string;
  menu: string;
  params: Dictionary<string, ParamValue>;

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
    this.params = new Dictionary<string, ParamValue>();
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
  readonly lang: string;
  languageName: string;
  languageDirection: string;
  contentDir: string;
  weight: int;

  constructor(lang: string) {
    this.lang = lang;
    this.languageName = lang;
    this.languageDirection = "ltr";
    this.contentDir = `content.${lang}`;
    this.weight = 0;
  }

  toConfig(): LanguageConfig {
    return new LanguageConfig(this.lang, this.languageName, this.languageDirection, this.contentDir, this.weight);
  }
}
