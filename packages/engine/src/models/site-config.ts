import { ParamValue } from "../params.ts";
import { LanguageConfig } from "./language.ts";
import { MenuEntry } from "./menu-entry.ts";

export class ModuleMount {
  source: string;
  target: string;

  constructor(source: string, target: string) {
    this.source = source;
    this.target = target;
  }
}

export class SiteConfig {
  title: string;
  baseURL: string;
  languageCode: string;
  contentDir: string;
  languages: LanguageConfig[];
  theme: string | undefined;
  copyright: string | undefined;
  Params: Map<string, ParamValue>;
  Menus: Map<string, MenuEntry[]>;
  moduleMounts: ModuleMount[];

  constructor(title: string, baseURL: string, languageCode: string, theme: string | undefined, copyright?: string) {
    this.title = title;
    this.baseURL = baseURL;
    this.languageCode = languageCode;
    this.contentDir = "content";
    const empty: LanguageConfig[] = [];
    this.languages = empty;
    this.theme = theme;
    this.copyright = copyright;
    this.Params = new Map<string, ParamValue>();
    this.Menus = new Map<string, MenuEntry[]>();
    const emptyMounts: ModuleMount[] = [];
    this.moduleMounts = emptyMounts;
  }
}
