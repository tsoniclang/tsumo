import { Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder, LanguageConfigBuilder } from "./builders.ts";
import { unquote, sortLanguages } from "./helpers.ts";

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
