import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, ModuleMount, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { parseInt32 } from "../utils/int32.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { LanguageConfigBuilder, MenuEntryBuilder } from "./builders.ts";
import { unquote, sortLanguages } from "./helpers.ts";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";

const tryParseInt = (value: string): int | undefined => parseInt32(value);

const parseTomlValue = (value: string): ParamValue => {
  const trimmed = value.trim();
  if (trimmed === "true") return ParamValue.bool(true);
  if (trimmed === "false") return ParamValue.bool(false);

  const parsed = tryParseInt(trimmed);
  return parsed !== undefined ? ParamValue.number(parsed) : ParamValue.string(unquote(trimmed));
};

export const parseModuleToml = (text: string): ModuleMount[] => {
  const mounts: ModuleMount[] = [];
  const lines = replaceLineEndings(text, "\n").split("\n");

  let inMount = false;
  let currentSource = "";
  let currentTarget = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line === "[[mounts]]") {
      if (inMount && currentSource !== "" && currentTarget !== "") {
        mounts.push(new ModuleMount(currentSource, currentTarget));
      }
      inMount = true;
      currentSource = "";
      currentTarget = "";
      continue;
    }

    if (inMount && line.includes("=")) {
      const eq = line.indexOf("=");
      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const value = unquote(substringFrom(line, eq + 1).trim());
      if (key === "source") currentSource = value;
      else if (key === "target") currentTarget = value;
    }
  }

  if (inMount && currentSource !== "" && currentTarget !== "") {
    mounts.push(new ModuleMount(currentSource, currentTarget));
  }

  return mounts;
};

export const parseTomlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let hasLanguageCode = false;
  let contentDir = "content";
  let theme: string | undefined;
  let copyright: string | undefined;
  const params = new Map<string, ParamValue>();
  const languages: LanguageConfigBuilder[] = [];
  const menuBuilders = new Map<string, MenuEntryBuilder[]>();

  const lines = replaceLineEndings(text, "\n").split("\n");

  let table = "";
  let isArrayTable = false;
  let currentMenuEntry: MenuEntryBuilder | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const tableName = substringCount(line, 2, line.length - 4).trim().toLowerCase();
      table = tableName;
      isArrayTable = true;

      if (tableName.startsWith("menu.")) {
        const menuName = substringFrom(tableName, "menu.".length).trim();
        currentMenuEntry = new MenuEntryBuilder(menuName);
        const entries = menuBuilders.get(menuName) ?? [];
        entries.push(currentMenuEntry);
        menuBuilders.set(menuName, entries);
      } else {
        currentMenuEntry = undefined;
      }
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      table = substringCount(line, 1, line.length - 2).trim().toLowerCase();
      isArrayTable = false;
      currentMenuEntry = undefined;
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = substringCount(line, 0, eq).trim();
    const value = unquote(substringFrom(line, eq + 1).trim());

    if (isArrayTable && currentMenuEntry !== undefined && table.startsWith("menu.")) {
      const menuKey = key.toLowerCase();
      if (menuKey === "name") currentMenuEntry.name = value;
      else if (menuKey === "url") currentMenuEntry.url = value;
      else if (menuKey === "pageref") currentMenuEntry.pageRef = value;
      else if (menuKey === "title") currentMenuEntry.title = value;
      else if (menuKey === "parent") currentMenuEntry.parent = value;
      else if (menuKey === "identifier") currentMenuEntry.identifier = value;
      else if (menuKey === "pre") currentMenuEntry.pre = value;
      else if (menuKey === "post") currentMenuEntry.post = value;
      else if (menuKey === "weight") {
        const parsed = tryParseInt(value);
        if (parsed !== undefined) currentMenuEntry.weight = parsed;
      }
      continue;
    }

    if (table === "params") {
      params.set(key, ParamValue.parseScalar(value));
      continue;
    }

    if (table.startsWith("languages.")) {
      const lang = substringFrom(table, "languages.".length).trim();
      if (lang !== "") {
        let entry = languages.find((current) => current.lang.toLowerCase() === lang);
        if (entry === undefined) {
          entry = new LanguageConfigBuilder(lang);
          languages.push(entry);
        }

        const langKey = key.toLowerCase();
        if (langKey === "languagename") entry.languageName = value;
        else if (langKey === "languagedirection") entry.languageDirection = value;
        else if (langKey === "contentdir") entry.contentDir = value;
        else if (langKey === "weight") {
          const parsed = tryParseInt(value);
          if (parsed !== undefined) entry.weight = parsed;
        }
        continue;
      }
    }

    const lower = key.toLowerCase();
    if (lower === "title") title = value;
    else if (lower === "baseurl") baseURL = value;
    else if (lower === "languagecode") {
      languageCode = value;
      hasLanguageCode = true;
    } else if (lower === "contentdir") contentDir = value;
    else if (lower === "theme") theme = value;
    else if (lower === "copyright") copyright = value;
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  if (languages.length > 0) {
    config.languages = sortLanguages(languages.map((entry) => entry.toConfig()));
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;

  for (const [menuName, builders] of menuBuilders) {
    const entries: MenuEntry[] = [];
    for (let i = 0; i < builders.length; i++) entries.push(builders[i]!.toEntry());
    config.Menus.set(menuName, buildMenuHierarchy(entries));
  }

  return config;
};

export const mergeTomlIntoConfig = (config: SiteConfig, text: string, fileName: string): SiteConfig => {
  const lines = replaceLineEndings(text, "\n").split("\n");
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName === "params.toml") {
    let nestedPrefix = "";
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        const table = substringCount(line, 1, line.length - 2).trim();
        nestedPrefix = table === "" ? "" : `${table}.`;
        continue;
      }

      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = `${nestedPrefix}${substringCount(line, 0, eq).trim()}`;
      config.Params.set(key, parseTomlValue(substringFrom(line, eq + 1).trim()));
    }
    return config;
  }

  if (lowerFileName === "languages.toml") {
    const langBuilders = new Map<string, LanguageConfigBuilder>();
    let currentLang = "";
    let inParamsTable = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        const tableName = substringCount(line, 1, line.length - 2).trim().toLowerCase();
        if (tableName.includes(".params")) {
          currentLang = substringCount(tableName, 0, tableName.indexOf("."));
          inParamsTable = true;
        } else {
          currentLang = tableName;
          inParamsTable = false;
          if (!langBuilders.has(currentLang)) {
            langBuilders.set(currentLang, new LanguageConfigBuilder(currentLang));
          }
        }
        continue;
      }

      if (currentLang === "" || inParamsTable) continue;

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const value = unquote(substringFrom(line, eq + 1).trim());
      const builder = langBuilders.get(currentLang);
      if (builder === undefined) continue;

      if (key === "languagename") builder.languageName = value;
      else if (key === "languagedirection") builder.languageDirection = value;
      else if (key === "contentdir") builder.contentDir = value;
      else if (key === "weight") {
        const parsed = tryParseInt(value);
        if (parsed !== undefined) builder.weight = parsed;
      }
    }

    config.languages = sortLanguages(Array.from(langBuilders.values(), (builder) => builder.toConfig()));
    if (config.languages.length > 0) {
      const selected = config.languages[0]!;
      config.contentDir = selected.contentDir;
      config.languageCode = selected.lang;
    }
    return config;
  }

  if (lowerFileName.startsWith("languages.") && lowerFileName.endsWith(".toml")) {
    const prefixLength = "languages.".length;
    const suffixLength = ".toml".length;
    const extractLength = lowerFileName.length - prefixLength - suffixLength;
    if (extractLength <= 0) return config;

    const langCode = substringCount(lowerFileName, prefixLength, extractLength);
    if (langCode === "") return config;

    let langBuilder = config.languages.find((language) => language.lang.toLowerCase() === langCode);
    const nextBuilder = new LanguageConfigBuilder(langCode);
    if (langBuilder !== undefined) {
      nextBuilder.languageName = langBuilder.languageName;
      nextBuilder.languageDirection = langBuilder.languageDirection;
      nextBuilder.contentDir = langBuilder.contentDir;
      nextBuilder.weight = langBuilder.weight;
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const value = unquote(substringFrom(line, eq + 1).trim());

      if (key === "languagename") nextBuilder.languageName = value;
      else if (key === "languagedirection") nextBuilder.languageDirection = value;
      else if (key === "contentdir") nextBuilder.contentDir = value;
      else if (key === "weight") {
        const parsed = tryParseInt(value);
        if (parsed !== undefined) nextBuilder.weight = parsed;
      }
    }

    const nextLanguages = config.languages.filter((language) => language.lang.toLowerCase() !== langCode);
    nextLanguages.push(nextBuilder.toConfig());
    config.languages = sortLanguages(nextLanguages);
    return config;
  }

  if (lowerFileName.startsWith("menus.") && lowerFileName.endsWith(".toml")) {
    const menuBuilders = new Map<string, MenuEntryBuilder[]>();
    let currentMenuEntry: MenuEntryBuilder | undefined;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[[") && line.endsWith("]]")) {
        const tableName = substringCount(line, 2, line.length - 4).trim().toLowerCase();
        currentMenuEntry = new MenuEntryBuilder(tableName);
        const entries = menuBuilders.get(tableName) ?? [];
        entries.push(currentMenuEntry);
        menuBuilders.set(tableName, entries);
        continue;
      }

      if (currentMenuEntry === undefined) continue;

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const value = unquote(substringFrom(line, eq + 1).trim());

      if (key === "name") currentMenuEntry.name = value;
      else if (key === "url") currentMenuEntry.url = value;
      else if (key === "pageref") currentMenuEntry.pageRef = value;
      else if (key === "title") currentMenuEntry.title = value;
      else if (key === "parent") currentMenuEntry.parent = value;
      else if (key === "identifier") currentMenuEntry.identifier = value;
      else if (key === "pre") currentMenuEntry.pre = value;
      else if (key === "post") currentMenuEntry.post = value;
      else if (key === "weight") {
        const parsed = tryParseInt(value);
        if (parsed !== undefined) currentMenuEntry.weight = parsed;
      }
    }

    for (const [menuName, builders] of menuBuilders) {
      const entries: MenuEntry[] = [];
      for (let i = 0; i < builders.length; i++) entries.push(builders[i]!.toEntry());
      config.Menus.set(menuName, buildMenuHierarchy(entries));
    }
    return config;
  }

  if (lowerFileName === "hugo.toml" || lowerFileName === "config.toml") {
    let table = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        table = substringCount(line, 1, line.length - 2).trim().toLowerCase();
        continue;
      }

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const rawValue = substringFrom(line, eq + 1).trim();
      const value = unquote(rawValue);

      if (table === "") {
        if (key === "title") config.title = value;
        else if (key === "baseurl") config.baseURL = ensureTrailingSlash(value);
        else if (key === "languagecode") config.languageCode = value;
        else if (key === "contentdir") config.contentDir = value;
        else if (key === "theme") config.theme = value;
        else if (key === "copyright") config.copyright = value;
      } else if (table === "params") {
        config.Params.set(key, parseTomlValue(rawValue));
      }
    }
  }

  return config;
};
