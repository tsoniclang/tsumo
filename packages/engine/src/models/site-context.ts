import { ParamValue } from "../params.js";
import type { int32 } from "@tsonic/core/types.js";
import type { DocsMountContext } from "../docs/models.js";
import { LanguageConfig, LanguageContext } from "./language.js";
import { MenuEntry } from "./menu-entry.js";
import { OutputFormat } from "./output-format.js";
import { SiteConfig } from "./site-config.js";
import type { PageContext } from "./page-context.js";
import type { ScratchStore } from "../template/values/scratch.js";

export class SiteContext {
  title: string;
  baseURL: string;
  languageCode: string;
  copyright: string;
  Language: LanguageContext;
  Languages: LanguageContext[];
  IsMultiLingual: boolean;
  LanguagePrefix: string;
  Params: Map<string, ParamValue>;
  Menus: Map<string, MenuEntry[]>;
  Taxonomies: Map<string, Map<string, PageContext[]>>;
  taxonomyTermPages: Map<string, Map<string, PageContext>>;
  store: ScratchStore | undefined;
  pages: PageContext[];
  allPages: PageContext[];
  home: PageContext | undefined;
  docsMounts: DocsMountContext[];
  Sites: SiteContext[];
  paginationSize: int32;

  constructor(config: SiteConfig, pages: PageContext[], languageRaw: LanguageConfig | undefined, allLanguagesRaw: LanguageContext[] | undefined) {
    this.title = config.title;
    this.baseURL = config.baseURL;
    this.copyright = config.copyright ?? "";

    // Set language from explicit parameter or config
    // Note: languageCode must always match Language.Lang for consistency
    const language = languageRaw;
    if (language !== undefined) {
      this.Language = new LanguageContext(language.lang, language.languageName, language.languageDirection);
      this.languageCode = language.lang;
    } else {
      const lang = config.languages.length > 0 ? config.languages[0]!.lang : (config.languageCode.trim() === "" ? "en" : config.languageCode);
      const name = config.languages.length > 0 ? config.languages[0]!.languageName : lang;
      const dir = config.languages.length > 0 ? config.languages[0]!.languageDirection : "ltr";
      this.Language = new LanguageContext(lang, name, dir);
      this.languageCode = lang;  // Use computed lang, not config.languageCode, for consistency
    }

    // Set all languages
    // Note: IsMultiLingual is false until per-language build is implemented.
    // Even with multiple configured languages, we only build for one language currently.
    const allLanguages = allLanguagesRaw;
    if (allLanguages !== undefined && allLanguages.length > 0) {
      this.Languages = allLanguages;
    } else {
      const langs: LanguageContext[] = [this.Language];
      this.Languages = langs;
    }
    this.IsMultiLingual = false;

    // Set language prefix (e.g., "/fr" for non-default language)
    this.LanguagePrefix = "";

    this.Params = config.Params;
    this.Menus = config.Menus;
    this.Taxonomies = new Map<string, Map<string, PageContext[]>>();
    this.taxonomyTermPages = new Map<string, Map<string, PageContext>>();
    this.store = undefined;
    this.pages = pages;
    this.allPages = pages;
    this.home = undefined;
    const empty: DocsMountContext[] = [];
    this.docsMounts = empty;
    const emptySites: SiteContext[] = [];
    this.Sites = emptySites;
    this.paginationSize = 10;
  }

  getOutputFormats(): OutputFormat[] {
    const rss = new OutputFormat("alternate", "application/rss+xml", this.baseURL + "index.xml");
    const formats: OutputFormat[] = [rss];
    return formats;
  }
}
