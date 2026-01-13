import { Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig, ModuleMount } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder, LanguageConfigBuilder } from "./builders.ts";
import { unquote, sortLanguages } from "./helpers.ts";

/**
 * Parse module.toml to extract mount configurations.
 * Format:
 * [[mounts]]
 *   source = "node_modules/some-package/layouts"
 *   target = "layouts"
 */
export const parseModuleToml = (text: string): ModuleMount[] => {
  const mounts = new List<ModuleMount>();
  const lines = text.replaceLineEndings("\n").split("\n");

  let inMount = false;
  let currentSource = "";
  let currentTarget = "";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line === "[[mounts]]") {
      // Save previous mount if valid
      if (inMount && currentSource !== "" && currentTarget !== "") {
        mounts.add(new ModuleMount(currentSource, currentTarget));
      }
      inMount = true;
      currentSource = "";
      currentTarget = "";
      continue;
    }

    if (inMount && line.contains("=")) {
      const eq = line.indexOf("=");
      const key = line.substring(0, eq).trim().toLowerInvariant();
      const value = unquote(line.substring(eq + 1).trim());

      if (key === "source") currentSource = value;
      else if (key === "target") currentTarget = value;
    }
  }

  // Don't forget the last mount
  if (inMount && currentSource !== "" && currentTarget !== "") {
    mounts.add(new ModuleMount(currentSource, currentTarget));
  }

  return mounts.toArray();
};

// Helper to parse a TOML value (handles booleans, numbers, strings)
// Arrays are treated as strings for now
const parseTomlValue = (value: string): ParamValue => {
  const v = value.trim();

  // Boolean
  if (v === "true") return ParamValue.bool(true);
  if (v === "false") return ParamValue.bool(false);

  // Number
  let parsed: int = 0;
  if (Int32.tryParse(v, parsed)) return ParamValue.number(parsed);

  // String (remove quotes) - also handles arrays as string representation
  return ParamValue.string(unquote(v));
};

export const parseTomlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let hasLanguageCode = false;
  let contentDir = "content";
  let theme: string | undefined = undefined;
  let copyright: string | undefined = undefined;
  const params = new Dictionary<string, ParamValue>();
  const languages = new List<LanguageConfigBuilder>();
  const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();

  const lines = text.replaceLineEndings("\n").split("\n");

  let table = "";
  let isArrayTable = false;
  let currentMenuEntry: MenuEntryBuilder | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const tableName = line.substring(2, line.length - 4).trim().toLowerInvariant();
      table = tableName;
      isArrayTable = true;

      if (tableName.startsWith("menu.")) {
        const menuName = tableName.substring("menu.".length).trim();
        currentMenuEntry = new MenuEntryBuilder(menuName);
        let entries = new List<MenuEntryBuilder>();
        const hasMenu = menuBuilders.tryGetValue(menuName, entries);
        if (!hasMenu) {
          entries = new List<MenuEntryBuilder>();
          menuBuilders.remove(menuName);
          menuBuilders.add(menuName, entries);
        }
        entries.add(currentMenuEntry);
      } else {
        currentMenuEntry = undefined;
      }
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      table = line.substring(1, line.length - 2).trim().toLowerInvariant();
      isArrayTable = false;
      currentMenuEntry = undefined;
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.substring(0, eq).trim();
    const value = unquote(line.substring(eq + 1).trim());

    if (isArrayTable && currentMenuEntry !== undefined && table.startsWith("menu.")) {
      const menuKey = key.toLowerInvariant();
      if (menuKey === "name") currentMenuEntry.name = value;
      else if (menuKey === "url") currentMenuEntry.url = value;
      else if (menuKey === "pageref") currentMenuEntry.pageRef = value;
      else if (menuKey === "title") currentMenuEntry.title = value;
      else if (menuKey === "parent") currentMenuEntry.parent = value;
      else if (menuKey === "identifier") currentMenuEntry.identifier = value;
      else if (menuKey === "pre") currentMenuEntry.pre = value;
      else if (menuKey === "post") currentMenuEntry.post = value;
      else if (menuKey === "weight") {
        let parsed: int = 0;
        if (Int32.tryParse(value, parsed)) currentMenuEntry.weight = parsed;
      }
      continue;
    }

    if (table === "params") {
      params.remove(key);
      params.add(key, ParamValue.parseScalar(value));
      continue;
    }

    if (table.startsWith("languages.")) {
      const lang = table.substring("languages.".length).trim();
      if (lang !== "") {
        let entry: LanguageConfigBuilder | undefined = undefined;
        const existing = languages.toArray();
        for (let j = 0; j < existing.length; j++) {
          const cur = existing[j]!;
          if (cur.lang.toLowerInvariant() === lang) {
            entry = cur;
            break;
          }
        }
        if (entry === undefined) {
          entry = new LanguageConfigBuilder(lang);
          languages.add(entry);
        }

        const langKey = key.toLowerInvariant();
        if (langKey === "languagename") entry.languageName = value;
        else if (langKey === "languagedirection") entry.languageDirection = value;
        else if (langKey === "contentdir") entry.contentDir = value;
        else if (langKey === "weight") {
          let parsed: int = 0;
          if (Int32.tryParse(value, parsed)) entry.weight = parsed;
        }
        continue;
      }
    }

    const k = key.toLowerInvariant();
    if (k === "title") title = value;
    else if (k === "baseurl") baseURL = value;
    else if (k === "languagecode") {
      languageCode = value;
      hasLanguageCode = true;
    } else if (k === "contentdir") contentDir = value;
    else if (k === "theme") theme = value;
    else if (k === "copyright") copyright = value;
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  if (languages.count > 0) {
    const langConfigs = new List<LanguageConfig>();
    const arr = languages.toArray();
    for (let i = 0; i < arr.length; i++) langConfigs.add(arr[i]!.toConfig());
    config.languages = sortLanguages(langConfigs.toArray());
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;

  const menuKeysIt = menuBuilders.keys.getEnumerator();
  while (menuKeysIt.moveNext()) {
    const menuName = menuKeysIt.current;
    let builders = new List<MenuEntryBuilder>();
    const hasBuilders = menuBuilders.tryGetValue(menuName, builders);
    if (hasBuilders) {
      const entries = new List<MenuEntry>();
      const buildersArr = builders.toArray();
      for (let i = 0; i < buildersArr.length; i++) entries.add(buildersArr[i]!.toEntry());
      config.Menus.remove(menuName);
      config.Menus.add(menuName, buildMenuHierarchy(entries.toArray()));
    }
  }

  return config;
};

/**
 * Merge TOML config into an existing SiteConfig.
 * Handles different file types based on filename:
 * - hugo.toml/config.toml: base config
 * - params.toml: params section
 * - languages.*.toml: language-specific config
 * - menus.*.toml: menu definitions
 */
export const mergeTomlIntoConfig = (config: SiteConfig, text: string, fileName: string): SiteConfig => {
  const lines = text.replaceLineEndings("\n").split("\n");
  const lowerFileName = fileName.toLowerInvariant();

  // Handle params.toml - all keys go into config.Params
  if (lowerFileName === "params.toml") {
    let table = "";
    let nestedPrefix = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        table = line.substring(1, line.length - 1).trim();
        nestedPrefix = table === "" ? "" : table + ".";
        continue;
      }

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = nestedPrefix + line.substring(0, eq).trim();
      const value = line.substring(eq + 1).trim();
      config.Params.remove(key);
      config.Params.add(key, parseTomlValue(value));
    }
    return config;
  }

  // Handle languages.*.toml (e.g., languages.en.toml)
  if (lowerFileName.startsWith("languages.") && lowerFileName.endsWith(".toml")) {
    const langCode = lowerFileName.substring("languages.".length, lowerFileName.length - 5);
    if (langCode === "") return config;

    // Find or create language entry
    let langBuilder: LanguageConfigBuilder | undefined = undefined;
    const existingLangs = config.languages;
    for (let i = 0; i < existingLangs.length; i++) {
      if (existingLangs[i]!.lang.toLowerInvariant() === langCode) {
        langBuilder = new LanguageConfigBuilder(langCode);
        langBuilder.languageName = existingLangs[i]!.languageName;
        langBuilder.languageDirection = existingLangs[i]!.languageDirection;
        langBuilder.contentDir = existingLangs[i]!.contentDir;
        langBuilder.weight = existingLangs[i]!.weight;
        break;
      }
    }
    if (langBuilder === undefined) {
      langBuilder = new LanguageConfigBuilder(langCode);
    }

    let table = "";
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        table = line.substring(1, line.length - 1).trim().toLowerInvariant();
        continue;
      }

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = line.substring(0, eq).trim().toLowerInvariant();
      const value = unquote(line.substring(eq + 1).trim());

      if (key === "languagename") langBuilder.languageName = value;
      else if (key === "languagedirection") langBuilder.languageDirection = value;
      else if (key === "contentdir") langBuilder.contentDir = value;
      // Note: title is a language-specific site title override - not yet supported
      else if (key === "weight") {
        let parsed: int = 0;
        if (Int32.tryParse(value, parsed)) langBuilder.weight = parsed;
      }
    }

    // Update or add language config
    const newLangs = new List<LanguageConfig>();
    let found = false;
    for (let i = 0; i < existingLangs.length; i++) {
      if (existingLangs[i]!.lang.toLowerInvariant() === langCode) {
        newLangs.add(langBuilder.toConfig());
        found = true;
      } else {
        newLangs.add(existingLangs[i]!);
      }
    }
    if (!found) {
      newLangs.add(langBuilder.toConfig());
    }
    config.languages = sortLanguages(newLangs.toArray());
    return config;
  }

  // Handle menus.*.toml (e.g., menus.en.toml)
  if (lowerFileName.startsWith("menus.") && lowerFileName.endsWith(".toml")) {
    const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();
    let currentMenuEntry: MenuEntryBuilder | undefined = undefined;
    let currentMenuName = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[[") && line.endsWith("]]")) {
        const tableName = line.substring(2, line.length - 4).trim().toLowerInvariant();
        currentMenuName = tableName;
        currentMenuEntry = new MenuEntryBuilder(tableName);

        let entries = new List<MenuEntryBuilder>();
        const hasMenu = menuBuilders.tryGetValue(tableName, entries);
        if (!hasMenu) {
          entries = new List<MenuEntryBuilder>();
          menuBuilders.remove(tableName);
          menuBuilders.add(tableName, entries);
        }
        entries.add(currentMenuEntry);
        continue;
      }

      if (currentMenuEntry === undefined) continue;

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = line.substring(0, eq).trim().toLowerInvariant();
      const value = unquote(line.substring(eq + 1).trim());

      if (key === "name") currentMenuEntry.name = value;
      else if (key === "url") currentMenuEntry.url = value;
      else if (key === "pageref") currentMenuEntry.pageRef = value;
      else if (key === "title") currentMenuEntry.title = value;
      else if (key === "parent") currentMenuEntry.parent = value;
      else if (key === "identifier") currentMenuEntry.identifier = value;
      else if (key === "pre") currentMenuEntry.pre = value;
      else if (key === "post") currentMenuEntry.post = value;
      else if (key === "weight") {
        let parsed: int = 0;
        if (Int32.tryParse(value, parsed)) currentMenuEntry.weight = parsed;
      }
    }

    // Add menus to config
    const menuKeysIt = menuBuilders.keys.getEnumerator();
    while (menuKeysIt.moveNext()) {
      const menuName = menuKeysIt.current;
      let builders = new List<MenuEntryBuilder>();
      const hasBuilders = menuBuilders.tryGetValue(menuName, builders);
      if (hasBuilders) {
        const entries = new List<MenuEntry>();
        const buildersArr = builders.toArray();
        for (let j = 0; j < buildersArr.length; j++) entries.add(buildersArr[j]!.toEntry());
        config.Menus.remove(menuName);
        config.Menus.add(menuName, buildMenuHierarchy(entries.toArray()));
      }
    }
    return config;
  }

  // Handle hugo.toml/config.toml - base config
  if (lowerFileName === "hugo.toml" || lowerFileName === "config.toml") {
    let table = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        table = line.substring(1, line.length - 1).trim().toLowerInvariant();
        continue;
      }

      const eq = line.indexOf("=");
      if (eq < 0) continue;

      const key = line.substring(0, eq).trim().toLowerInvariant();
      const value = unquote(line.substring(eq + 1).trim());

      if (table === "") {
        if (key === "title") config.title = value;
        else if (key === "baseurl") config.baseURL = ensureTrailingSlash(value);
        else if (key === "languagecode") config.languageCode = value;
        else if (key === "contentdir") config.contentDir = value;
        else if (key === "theme") config.theme = value;
        else if (key === "copyright") config.copyright = value;
      } else if (table === "params") {
        config.Params.remove(key);
        config.Params.add(key, parseTomlValue(line.substring(eq + 1).trim()));
      }
    }
    return config;
  }

  return config;
};
