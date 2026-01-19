import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { ParamValue } from "../params.ts";
import type { DocsMountContext } from "../docs/models.ts";
import { LanguageConfig, LanguageContext } from "./language.ts";
import { MenuEntry } from "./menu-entry.ts";
import { OutputFormat } from "./output-format.ts";
import { SiteConfig } from "./site-config.ts";
import type { PageContext } from "./page-context.ts";

export class SiteContext {
  readonly title: string;
  readonly baseURL: string;
  readonly languageCode: string;
  readonly copyright: string;
  readonly Language: LanguageContext;
  readonly Languages: LanguageContext[];
  readonly IsMultiLingual: boolean;
  readonly LanguagePrefix: string;
  readonly Params: Dictionary<string, ParamValue>;
  readonly Menus: Dictionary<string, MenuEntry[]>;
  readonly Taxonomies: Dictionary<string, Dictionary<string, PageContext[]>>;
  readonly store: object | undefined;
  pages: PageContext[];
  allPages: PageContext[];
  home: PageContext | undefined;
  docsMounts: DocsMountContext[];
  Sites: SiteContext[];

  constructor(config: SiteConfig, pages: PageContext[], language?: LanguageConfig, allLanguages?: LanguageContext[]) {
    this.title = config.title;
    this.baseURL = config.baseURL;
    this.copyright = config.copyright ?? "";

    // Set language from explicit parameter or config
    // Note: languageCode must always match Language.Lang for consistency
    if (language !== undefined) {
      this.Language = new LanguageContext(language.lang, language.languageName, language.languageDirection);
      this.languageCode = language.lang;
    } else {
      const lang = config.languages.Length > 0 ? config.languages[0]!.lang : (config.languageCode.Trim() === "" ? "en" : config.languageCode);
      const name = config.languages.Length > 0 ? config.languages[0]!.languageName : lang;
      const dir = config.languages.Length > 0 ? config.languages[0]!.languageDirection : "ltr";
      this.Language = new LanguageContext(lang, name, dir);
      this.languageCode = lang;  // Use computed lang, not config.languageCode, for consistency
    }

    // Set all languages
    // Note: IsMultiLingual is false until per-language build is implemented.
    // Even with multiple configured languages, we only build for one language currently.
    if (allLanguages !== undefined && allLanguages.Length > 0) {
      this.Languages = allLanguages;
    } else {
      const langs: LanguageContext[] = [this.Language];
      this.Languages = langs;
    }
    this.IsMultiLingual = false; // TODO: Set true when per-language build is implemented

    // Set language prefix (e.g., "/fr" for non-default language)
    this.LanguagePrefix = "";

    this.Params = config.Params;
    this.Menus = config.Menus;
    this.Taxonomies = new Dictionary<string, Dictionary<string, PageContext[]>>();
    this.store = undefined;
    this.pages = pages;
    this.allPages = pages;
    this.home = undefined;
    const empty: DocsMountContext[] = [];
    this.docsMounts = empty;
    const emptySites: SiteContext[] = [];
    this.Sites = emptySites;
  }

  getOutputFormats(): OutputFormat[] {
    const rss = new OutputFormat("alternate", "application/rss+xml", this.baseURL + "index.xml");
    const formats: OutputFormat[] = [rss];
    return formats;
  }
}
