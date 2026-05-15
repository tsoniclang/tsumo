import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { toInt32 } from "../utils/int32.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { sortLanguages } from "./helpers.ts";
import { JsonArray, JsonBool, JsonNumber, JsonObject, JsonString, parseJson } from "../utils/json.ts";

export const parseJsonConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined = undefined;
  let copyright: string | undefined = undefined;
  const params = new Map<string, ParamValue>();
  const languages: LanguageConfig[] = [];
  const menuBuilders = new Map<string, MenuEntryBuilder[]>();
  let hasLanguageCode = false;

  const rootValue = parseJson(text);
  if (rootValue instanceof JsonObject) {
    const props = rootValue.properties;
    for (let i = 0; i < props.length; i++) {
      const property = props[i]!;
      const value = property.value;
      const key = property.key.toLowerCase();

      if (key === "title" && value instanceof JsonString) {
        title = value.value;
        continue;
      }
      if (key === "baseurl" && value instanceof JsonString) {
        baseURL = value.value;
        continue;
      }
      if (key === "languagecode" && value instanceof JsonString) {
        languageCode = value.value;
        hasLanguageCode = true;
        continue;
      }
      if (key === "contentdir" && value instanceof JsonString) {
        contentDir = value.value;
        continue;
      }
      if (key === "theme" && value instanceof JsonString) {
        theme = value.value;
        continue;
      }
      if (key === "copyright" && value instanceof JsonString) {
        copyright = value.value;
        continue;
      }
      if (key === "params" && value instanceof JsonObject) {
        const paramEntries = value.properties;
        for (let j = 0; j < paramEntries.length; j++) {
          const paramProperty = paramEntries[j]!;
          const paramValue = paramProperty.value;
          if (paramValue instanceof JsonString) params.set(paramProperty.key, ParamValue.string(paramValue.value));
          else if (paramValue instanceof JsonBool) params.set(paramProperty.key, ParamValue.bool(paramValue.value));
          else if (paramValue instanceof JsonNumber) {
            const narrowed = toInt32(paramValue.value);
            if (narrowed !== undefined) {
              params.set(paramProperty.key, ParamValue.number(narrowed));
            }
          }
        }
        continue;
      }

      if (key === "languages" && value instanceof JsonObject) {
        const languageEntries = value.properties;
        for (let j = 0; j < languageEntries.length; j++) {
          const languageProperty = languageEntries[j]!;
          const lang = languageProperty.key;
          const rawConfig = languageProperty.value;
          if (!(rawConfig instanceof JsonObject)) continue;

          let languageName = lang;
          let languageDirection = "ltr";
          let langContentDir = `content.${lang}`;
          let weight: int = 0;

          const configEntries = rawConfig.properties;
          for (let k = 0; k < configEntries.length; k++) {
            const configProperty = configEntries[k]!;
            const configValue = configProperty.value;
            const configKey = configProperty.key.toLowerCase();
            if (configKey === "languagename" && configValue instanceof JsonString) languageName = configValue.value;
            else if (configKey === "languagedirection" && configValue instanceof JsonString) languageDirection = configValue.value;
            else if (configKey === "contentdir" && configValue instanceof JsonString) langContentDir = configValue.value;
            else if (configKey === "weight" && configValue instanceof JsonNumber) {
              const narrowed = toInt32(configValue.value);
              if (narrowed !== undefined) {
                weight = narrowed;
              }
            }
          }

          languages.push(new LanguageConfig(lang, languageName, languageDirection, langContentDir, weight));
        }
        continue;
      }

      if (key === "menu" && value instanceof JsonObject) {
        const menuEntries = value.properties;
        for (let j = 0; j < menuEntries.length; j++) {
          const menuProperty = menuEntries[j]!;
          const menuName = menuProperty.key;
          const rawItems = menuProperty.value;
          if (!(rawItems instanceof JsonArray)) continue;
          const items = rawItems.items;

          const entries = menuBuilders.get(menuName) ?? [];
          for (let k = 0; k < items.length; k++) {
            const item = items[k]!;
            if (!(item instanceof JsonObject)) continue;

            const builder = new MenuEntryBuilder(menuName);
            const itemEntries = item.properties;
            for (let m = 0; m < itemEntries.length; m++) {
              const itemProperty = itemEntries[m]!;
              const itemValue = itemProperty.value;
              const itemKey = itemProperty.key.toLowerCase();
              if (itemKey === "name" && itemValue instanceof JsonString) builder.name = itemValue.value;
              else if (itemKey === "url" && itemValue instanceof JsonString) builder.url = itemValue.value;
              else if (itemKey === "pageref" && itemValue instanceof JsonString) builder.pageRef = itemValue.value;
              else if (itemKey === "title" && itemValue instanceof JsonString) builder.title = itemValue.value;
              else if (itemKey === "parent" && itemValue instanceof JsonString) builder.parent = itemValue.value;
              else if (itemKey === "identifier" && itemValue instanceof JsonString) builder.identifier = itemValue.value;
              else if (itemKey === "pre" && itemValue instanceof JsonString) builder.pre = itemValue.value;
              else if (itemKey === "post" && itemValue instanceof JsonString) builder.post = itemValue.value;
              else if (itemKey === "weight" && itemValue instanceof JsonNumber) {
                const narrowed = toInt32(itemValue.value);
                if (narrowed !== undefined) {
                  builder.weight = narrowed;
                }
              }
            }
            entries.push(builder);
          }

          menuBuilders.set(menuName, entries);
        }
      }
    }
  }

  const menus = new Map<string, MenuEntry[]>();
  for (const [menuName, builders] of menuBuilders) {
    const entries: MenuEntry[] = [];
    for (let i = 0; i < builders.length; i++) entries.push(builders[i]!.toEntry());
    menus.set(menuName, buildMenuHierarchy(entries));
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  if (languages.length > 0) {
    config.languages = sortLanguages(languages);
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;
  config.Menus = menus;
  return config;
};
