import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { ParamValue } from "../params.ts";
import { LanguageConfig } from "./language.ts";
import { MenuEntry } from "./menu-entry.ts";

export class SiteConfig {
  title: string;
  baseURL: string;
  languageCode: string;
  contentDir: string;
  languages: LanguageConfig[];
  theme: string | undefined;
  copyright: string | undefined;
  Params: Dictionary<string, ParamValue>;
  Menus: Dictionary<string, MenuEntry[]>;

  constructor(title: string, baseURL: string, languageCode: string, theme: string | undefined, copyright?: string) {
    this.title = title;
    this.baseURL = baseURL;
    this.languageCode = languageCode;
    this.contentDir = "content";
    const empty: LanguageConfig[] = [];
    this.languages = empty;
    this.theme = theme;
    this.copyright = copyright;
    this.Params = new Dictionary<string, ParamValue>();
    this.Menus = new Dictionary<string, MenuEntry[]>();
  }
}
