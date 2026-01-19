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
  const lines = text.ReplaceLineEndings("\n").Split("\n");

  let inMount = false;
  let currentSource = "";
  let currentTarget = "";

  for (let i = 0; i < lines.Length; i++) {
    const raw = lines[i]!;
    const line = raw.Trim();
    if (line === "" || line.StartsWith("#")) continue;

    if (line === "[[mounts]]") {
      // Save previous mount if valid
      if (inMount && currentSource !== "" && currentTarget !== "") {
        mounts.Add(new ModuleMount(currentSource, currentTarget));
      }
      inMount = true;
      currentSource = "";
      currentTarget = "";
      continue;
    }

    if (inMount && line.Contains("=")) {
      const eq = line.IndexOf("=");
      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = unquote(line.Substring(eq + 1).Trim());

      if (key === "source") currentSource = value;
      else if (key === "target") currentTarget = value;
    }
  }

  // Don't forget the last mount
  if (inMount && currentSource !== "" && currentTarget !== "") {
    mounts.Add(new ModuleMount(currentSource, currentTarget));
  }

  return mounts.ToArray();
};

// Helper to parse a TOML value (handles booleans, numbers, strings)
// Arrays are treated as strings for now
const parseTomlValue = (value: string): ParamValue => {
  const v = value.Trim();

  // Boolean
  if (v === "true") return ParamValue.bool(true);
  if (v === "false") return ParamValue.bool(false);

  // Number
  let parsed: int = 0;
  if (Int32.TryParse(v, parsed)) return ParamValue.number(parsed);

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

  const lines = text.ReplaceLineEndings("\n").Split("\n");

  let table = "";
  let isArrayTable = false;
  let currentMenuEntry: MenuEntryBuilder | undefined = undefined;

  for (let i = 0; i < lines.Length; i++) {
    const raw = lines[i]!;
    const line = raw.Trim();
    if (line === "" || line.StartsWith("#")) continue;

    if (line.StartsWith("[[") && line.EndsWith("]]")) {
      const tableName = line.Substring(2, line.Length - 4).Trim().ToLowerInvariant();
      table = tableName;
      isArrayTable = true;

      if (tableName.StartsWith("menu.")) {
        const menuName = tableName.Substring("menu.".Length).Trim();
        currentMenuEntry = new MenuEntryBuilder(menuName);
        let entries = new List<MenuEntryBuilder>();
        const hasMenu = menuBuilders.TryGetValue(menuName, entries);
        if (!hasMenu) {
          entries = new List<MenuEntryBuilder>();
          menuBuilders.Remove(menuName);
          menuBuilders.Add(menuName, entries);
        }
        entries.Add(currentMenuEntry);
      } else {
        currentMenuEntry = undefined;
      }
      continue;
    }

    if (line.StartsWith("[") && line.EndsWith("]")) {
      table = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();
      isArrayTable = false;
      currentMenuEntry = undefined;
      continue;
    }

    const eq = line.IndexOf("=");
    if (eq < 0) continue;

    const key = line.Substring(0, eq).Trim();
    const value = unquote(line.Substring(eq + 1).Trim());

    if (isArrayTable && currentMenuEntry !== undefined && table.StartsWith("menu.")) {
      const menuKey = key.ToLowerInvariant();
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
        if (Int32.TryParse(value, parsed)) currentMenuEntry.weight = parsed;
      }
      continue;
    }

    if (table === "params") {
      params.Remove(key);
      params.Add(key, ParamValue.parseScalar(value));
      continue;
    }

    if (table.StartsWith("languages.")) {
      const lang = table.Substring("languages.".Length).Trim();
      if (lang !== "") {
        let entry: LanguageConfigBuilder | undefined = undefined;
        const existing = languages.ToArray();
        for (let j = 0; j < existing.Length; j++) {
          const cur = existing[j]!;
          if (cur.lang.ToLowerInvariant() === lang) {
            entry = cur;
            break;
          }
        }
        if (entry === undefined) {
          entry = new LanguageConfigBuilder(lang);
          languages.Add(entry);
        }

        const langKey = key.ToLowerInvariant();
        if (langKey === "languagename") entry.languageName = value;
        else if (langKey === "languagedirection") entry.languageDirection = value;
        else if (langKey === "contentdir") entry.contentDir = value;
        else if (langKey === "weight") {
          let parsed: int = 0;
          if (Int32.TryParse(value, parsed)) entry.weight = parsed;
        }
        continue;
      }
    }

    const k = key.ToLowerInvariant();
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
  if (languages.Count > 0) {
    const langConfigs = new List<LanguageConfig>();
    const arr = languages.ToArray();
    for (let i = 0; i < arr.Length; i++) langConfigs.Add(arr[i]!.toConfig());
    config.languages = sortLanguages(langConfigs.ToArray());
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;

  const menuKeysIt = menuBuilders.Keys.GetEnumerator();
  while (menuKeysIt.MoveNext()) {
    const menuName = menuKeysIt.Current;
    let builders = new List<MenuEntryBuilder>();
    const hasBuilders = menuBuilders.TryGetValue(menuName, builders);
    if (hasBuilders) {
      const entries = new List<MenuEntry>();
      const buildersArr = builders.ToArray();
      for (let i = 0; i < buildersArr.Length; i++) entries.Add(buildersArr[i]!.toEntry());
      config.Menus.Remove(menuName);
      config.Menus.Add(menuName, buildMenuHierarchy(entries.ToArray()));
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
  const lines = text.ReplaceLineEndings("\n").Split("\n");
  const lowerFileName = fileName.ToLowerInvariant();

  // Handle params.toml - all keys go into config.Params
  if (lowerFileName === "params.toml") {
    let table = "";
    let nestedPrefix = "";

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[") && line.EndsWith("]") && !line.StartsWith("[[")) {
        table = line.Substring(1, line.Length - 2).Trim();
        nestedPrefix = table === "" ? "" : table + ".";
        continue;
      }

      const eq = line.IndexOf("=");
      if (eq < 0) continue;

      const key = nestedPrefix + line.Substring(0, eq).Trim();
      const value = line.Substring(eq + 1).Trim();
      config.Params.Remove(key);
      config.Params.Add(key, parseTomlValue(value));
    }
    return config;
  }

  // Handle languages.toml (combined file with all languages as tables like [en], [de])
  if (lowerFileName === "languages.toml") {
    const langBuilders = new Dictionary<string, LanguageConfigBuilder>();
    let currentLang = "";
    let inParamsTable = false;

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[") && line.EndsWith("]") && !line.StartsWith("[[")) {
        const tableName = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();

        // Check for [en.params] style table (language-specific params, skip for now)
        if (tableName.Contains(".params")) {
          currentLang = tableName.Substring(0, tableName.IndexOf("."));
          inParamsTable = true;
        } else {
          currentLang = tableName;
          inParamsTable = false;
          // Create builder if needed
          let existingBuilder = new LanguageConfigBuilder(currentLang);
          const hasBuilder = langBuilders.TryGetValue(currentLang, existingBuilder);
          if (!hasBuilder) {
            langBuilders.Add(currentLang, new LanguageConfigBuilder(currentLang));
          }
        }
        continue;
      }

      if (currentLang === "" || inParamsTable) continue;

      const eq = line.IndexOf("=");
      if (eq < 0) continue;

      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = unquote(line.Substring(eq + 1).Trim());

      let builder = new LanguageConfigBuilder(currentLang);
      const gotBuilder = langBuilders.TryGetValue(currentLang, builder);
      if (gotBuilder) {
        if (key === "languagename") builder.languageName = value;
        else if (key === "languagedirection") builder.languageDirection = value;
        else if (key === "contentdir") builder.contentDir = value;
        else if (key === "weight") {
          let parsed: int = 0;
          if (Int32.TryParse(value, parsed)) builder.weight = parsed;
        }
      }
    }

    // Convert builders to configs
    const newLangs = new List<LanguageConfig>();
    const keysIt = langBuilders.Keys.GetEnumerator();
    while (keysIt.MoveNext()) {
      let builder = new LanguageConfigBuilder("");
      if (langBuilders.TryGetValue(keysIt.Current, builder)) {
        newLangs.Add(builder.toConfig());
      }
    }

    config.languages = sortLanguages(newLangs.ToArray());
    if (config.languages.Length > 0) {
      const selected = config.languages[0]!;
      config.contentDir = selected.contentDir;
      config.languageCode = selected.lang;
    }

    return config;
  }

  // Handle languages.*.toml (per-language files, e.g., languages.en.toml)
  if (lowerFileName.StartsWith("languages.") && lowerFileName.EndsWith(".toml")) {
    const prefixLen = "languages.".Length;
    const suffixLen = ".toml".Length;
    const extractLen = lowerFileName.Length - prefixLen - suffixLen;
    if (extractLen <= 0) return config;
    const langCode = lowerFileName.Substring(prefixLen, extractLen);
    if (langCode === "") return config;

    // Find or create language entry
    let langBuilder: LanguageConfigBuilder | undefined = undefined;
    const existingLangs = config.languages;
    for (let i = 0; i < existingLangs.Length; i++) {
      if (existingLangs[i]!.lang.ToLowerInvariant() === langCode) {
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
    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[") && line.EndsWith("]") && !line.StartsWith("[[")) {
        table = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();
        continue;
      }

      const eq = line.IndexOf("=");
      if (eq < 0) continue;

      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = unquote(line.Substring(eq + 1).Trim());

      if (key === "languagename") langBuilder.languageName = value;
      else if (key === "languagedirection") langBuilder.languageDirection = value;
      else if (key === "contentdir") langBuilder.contentDir = value;
      // Note: title is a language-specific site title override - not yet supported
      else if (key === "weight") {
        let parsed: int = 0;
        if (Int32.TryParse(value, parsed)) langBuilder.weight = parsed;
      }
    }

    // Update or add language config
    const newLangs = new List<LanguageConfig>();
    let found = false;
    for (let i = 0; i < existingLangs.Length; i++) {
      if (existingLangs[i]!.lang.ToLowerInvariant() === langCode) {
        newLangs.Add(langBuilder.toConfig());
        found = true;
      } else {
        newLangs.Add(existingLangs[i]!);
      }
    }
    if (!found) {
      newLangs.Add(langBuilder.toConfig());
    }
    config.languages = sortLanguages(newLangs.ToArray());
    return config;
  }

  // Handle menus.*.toml (e.g., menus.en.toml)
  if (lowerFileName.StartsWith("menus.") && lowerFileName.EndsWith(".toml")) {
    const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();
    let currentMenuEntry: MenuEntryBuilder | undefined = undefined;
    let currentMenuName = "";

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[[") && line.EndsWith("]]")) {
        const tableName = line.Substring(2, line.Length - 4).Trim().ToLowerInvariant();
        currentMenuName = tableName;
        currentMenuEntry = new MenuEntryBuilder(tableName);

        let entries = new List<MenuEntryBuilder>();
        const hasMenu = menuBuilders.TryGetValue(tableName, entries);
        if (!hasMenu) {
          entries = new List<MenuEntryBuilder>();
          menuBuilders.Remove(tableName);
          menuBuilders.Add(tableName, entries);
        }
        entries.Add(currentMenuEntry);
        continue;
      }

      if (currentMenuEntry === undefined) continue;

      const eq = line.IndexOf("=");
      if (eq < 0) continue;

      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = unquote(line.Substring(eq + 1).Trim());

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
        if (Int32.TryParse(value, parsed)) currentMenuEntry.weight = parsed;
      }
    }

    // Add menus to config
    const menuKeysIt = menuBuilders.Keys.GetEnumerator();
    while (menuKeysIt.MoveNext()) {
      const menuName = menuKeysIt.Current;
      let builders = new List<MenuEntryBuilder>();
      const hasBuilders = menuBuilders.TryGetValue(menuName, builders);
      if (hasBuilders) {
        const entries = new List<MenuEntry>();
        const buildersArr = builders.ToArray();
        for (let j = 0; j < buildersArr.Length; j++) entries.Add(buildersArr[j]!.toEntry());
        config.Menus.Remove(menuName);
        config.Menus.Add(menuName, buildMenuHierarchy(entries.ToArray()));
      }
    }
    return config;
  }

  // Handle hugo.toml/config.toml - base config
  if (lowerFileName === "hugo.toml" || lowerFileName === "config.toml") {
    let table = "";

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[") && line.EndsWith("]") && !line.StartsWith("[[")) {
        table = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();
        continue;
      }

      const eq = line.IndexOf("=");
      if (eq < 0) continue;

      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = unquote(line.Substring(eq + 1).Trim());

      if (table === "") {
        if (key === "title") config.title = value;
        else if (key === "baseurl") config.baseURL = ensureTrailingSlash(value);
        else if (key === "languagecode") config.languageCode = value;
        else if (key === "contentdir") config.contentDir = value;
        else if (key === "theme") config.theme = value;
        else if (key === "copyright") config.copyright = value;
      } else if (table === "params") {
        config.Params.Remove(key);
        config.Params.Add(key, parseTomlValue(line.Substring(eq + 1).Trim()));
      }
    }
    return config;
  }

  return config;
};
