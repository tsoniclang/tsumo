import type { int, JsValue } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { toInt32 } from "../utils/int32.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { sortLanguages } from "./helpers.ts";

const isObject = (value: JsValue): value is Record<string, JsValue> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

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

  const root = JSON.parse(text);
  if (isObject(root)) {
    const props = Object.entries(root);
    for (let i = 0; i < props.length; i++) {
      const [keyRaw, value] = props[i]!;
      const key = keyRaw.toLowerCase();

      if (key === "title" && typeof value === "string") {
        title = value;
        continue;
      }
      if (key === "baseurl" && typeof value === "string") {
        baseURL = value;
        continue;
      }
      if (key === "languagecode" && typeof value === "string") {
        languageCode = value;
        hasLanguageCode = true;
        continue;
      }
      if (key === "contentdir" && typeof value === "string") {
        contentDir = value;
        continue;
      }
      if (key === "theme" && typeof value === "string") {
        theme = value;
        continue;
      }
      if (key === "copyright" && typeof value === "string") {
        copyright = value;
        continue;
      }
      if (key === "params" && isObject(value)) {
        const paramEntries = Object.entries(value);
        for (let j = 0; j < paramEntries.length; j++) {
          const [paramName, paramValue] = paramEntries[j]!;
          if (typeof paramValue === "string") params.set(paramName, ParamValue.string(paramValue));
          else if (typeof paramValue === "boolean") params.set(paramName, ParamValue.bool(paramValue));
          else if (typeof paramValue === "number") {
            const narrowed = toInt32(paramValue);
            if (narrowed !== undefined) {
              params.set(paramName, ParamValue.number(narrowed));
            }
          }
        }
        continue;
      }

      if (key === "languages" && isObject(value)) {
        const languageEntries = Object.entries(value);
        for (let j = 0; j < languageEntries.length; j++) {
          const [lang, rawConfig] = languageEntries[j]!;
          if (!isObject(rawConfig)) continue;

          let languageName = lang;
          let languageDirection = "ltr";
          let langContentDir = `content.${lang}`;
          let weight: int = 0;

          const configEntries = Object.entries(rawConfig);
          for (let k = 0; k < configEntries.length; k++) {
            const [configKeyRaw, configValue] = configEntries[k]!;
            const configKey = configKeyRaw.toLowerCase();
            if (configKey === "languagename" && typeof configValue === "string") languageName = configValue;
            else if (configKey === "languagedirection" && typeof configValue === "string") languageDirection = configValue;
            else if (configKey === "contentdir" && typeof configValue === "string") langContentDir = configValue;
            else if (configKey === "weight" && typeof configValue === "number") {
              const narrowed = toInt32(configValue);
              if (narrowed !== undefined) {
                weight = narrowed;
              }
            }
          }

          languages.push(new LanguageConfig(lang, languageName, languageDirection, langContentDir, weight));
        }
        continue;
      }

      if (key === "menu" && isObject(value)) {
        const menuEntries = Object.entries(value);
        for (let j = 0; j < menuEntries.length; j++) {
          const [menuName, rawItems] = menuEntries[j]!;
          if (!Array.isArray(rawItems)) continue;
          const items = rawItems as JsValue[];

          const entries = menuBuilders.get(menuName) ?? [];
          for (let k = 0; k < items.length; k++) {
            const item = items[k]!;
            if (!isObject(item)) continue;

            const builder = new MenuEntryBuilder(menuName);
            const itemEntries = Object.entries(item);
            for (let m = 0; m < itemEntries.length; m++) {
              const [itemKeyRaw, itemValue] = itemEntries[m]!;
              const itemKey = itemKeyRaw.toLowerCase();
              if (itemKey === "name" && typeof itemValue === "string") builder.name = itemValue;
              else if (itemKey === "url" && typeof itemValue === "string") builder.url = itemValue;
              else if (itemKey === "pageref" && typeof itemValue === "string") builder.pageRef = itemValue;
              else if (itemKey === "title" && typeof itemValue === "string") builder.title = itemValue;
              else if (itemKey === "parent" && typeof itemValue === "string") builder.parent = itemValue;
              else if (itemKey === "identifier" && typeof itemValue === "string") builder.identifier = itemValue;
              else if (itemKey === "pre" && typeof itemValue === "string") builder.pre = itemValue;
              else if (itemKey === "post" && typeof itemValue === "string") builder.post = itemValue;
              else if (itemKey === "weight" && typeof itemValue === "number") {
                const narrowed = toInt32(itemValue);
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
