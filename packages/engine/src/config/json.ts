import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { JsonDocument, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { sortLanguages } from "./helpers.ts";

export const parseJsonConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined = undefined;
  let copyright: string | undefined = undefined;
  const params = new Dictionary<string, ParamValue>();
  const languages = new List<LanguageConfig>();
  const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();
  let hasLanguageCode = false;

  const doc = JsonDocument.parse(text);
  const root = doc.rootElement;

  if (root.valueKind === JsonValueKind.object_) {
    const props = root.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      const key = p.name.toLowerInvariant();
      const v = p.value;

      if (key === "title" && v.valueKind === JsonValueKind.string_) {
        title = v.getString() ?? title;
        continue;
      }
      if (key === "baseurl" && v.valueKind === JsonValueKind.string_) {
        baseURL = v.getString() ?? baseURL;
        continue;
      }
      if (key === "languagecode" && v.valueKind === JsonValueKind.string_) {
        languageCode = v.getString() ?? languageCode;
        hasLanguageCode = true;
        continue;
      }
      if (key === "contentdir" && v.valueKind === JsonValueKind.string_) {
        contentDir = v.getString() ?? contentDir;
        continue;
      }
      if (key === "theme" && v.valueKind === JsonValueKind.string_) {
        theme = v.getString();
        continue;
      }
      if (key === "copyright" && v.valueKind === JsonValueKind.string_) {
        copyright = v.getString();
        continue;
      }
      if (key === "params" && v.valueKind === JsonValueKind.object_) {
        const pp = v.enumerateObject().getEnumerator();
        while (pp.moveNext()) {
          const prop = pp.current;
          const val = prop.value;
          if (val.valueKind === JsonValueKind.string_) {
            const s = val.getString();
            if (s !== undefined) {
              params.remove(prop.name);
              params.add(prop.name, ParamValue.string(s));
            }
          } else if (val.valueKind === JsonValueKind.true_ || val.valueKind === JsonValueKind.false_) {
            params.remove(prop.name);
            params.add(prop.name, ParamValue.bool(val.getBoolean()));
          } else if (val.valueKind === JsonValueKind.number_) {
            params.remove(prop.name);
            params.add(prop.name, ParamValue.number(val.getInt32()));
          }
        }
      }

      if (key === "languages" && v.valueKind === JsonValueKind.object_) {
        const lp = v.enumerateObject().getEnumerator();
        while (lp.moveNext()) {
          const langProp = lp.current;
          if (langProp.value.valueKind !== JsonValueKind.object_) continue;
          const lang = langProp.name;

          let languageName = lang;
          let languageDirection = "ltr";
          let langContentDir = `content.${lang}`;
          let weight: int = 0;

          const cfgProps = langProp.value.enumerateObject().getEnumerator();
          while (cfgProps.moveNext()) {
            const c = cfgProps.current;
            const ck = c.name.toLowerInvariant();
            const cv = c.value;
            if (ck === "languagename" && cv.valueKind === JsonValueKind.string_) languageName = cv.getString() ?? languageName;
            else if (ck === "languagedirection" && cv.valueKind === JsonValueKind.string_) languageDirection = cv.getString() ?? languageDirection;
            else if (ck === "contentdir" && cv.valueKind === JsonValueKind.string_) langContentDir = cv.getString() ?? langContentDir;
            else if (ck === "weight" && cv.valueKind === JsonValueKind.number_) weight = cv.getInt32();
          }

          languages.add(new LanguageConfig(lang, languageName, languageDirection, langContentDir, weight));
        }
      }

      // Parse menu entries
      if (key === "menu" && v.valueKind === JsonValueKind.object_) {
        const menuProps = v.enumerateObject().getEnumerator();
        while (menuProps.moveNext()) {
          const menuProp = menuProps.current;
          const menuName = menuProp.name;
          if (menuProp.value.valueKind !== JsonValueKind.array) continue;

          let entries = new List<MenuEntryBuilder>();
          const hasMenu = menuBuilders.tryGetValue(menuName, entries);
          if (!hasMenu) {
            entries = new List<MenuEntryBuilder>();
            menuBuilders.remove(menuName);
            menuBuilders.add(menuName, entries);
          }

          const menuItems = menuProp.value.enumerateArray().getEnumerator();
          while (menuItems.moveNext()) {
            const item = menuItems.current;
            if (item.valueKind !== JsonValueKind.object_) continue;

            const builder = new MenuEntryBuilder(menuName);
            const itemProps = item.enumerateObject().getEnumerator();
            while (itemProps.moveNext()) {
              const ip = itemProps.current;
              const ik = ip.name.toLowerInvariant();
              const iv = ip.value;
              if (ik === "name" && iv.valueKind === JsonValueKind.string_) builder.name = iv.getString() ?? "";
              else if (ik === "url" && iv.valueKind === JsonValueKind.string_) builder.url = iv.getString() ?? "";
              else if (ik === "pageref" && iv.valueKind === JsonValueKind.string_) builder.pageRef = iv.getString() ?? "";
              else if (ik === "title" && iv.valueKind === JsonValueKind.string_) builder.title = iv.getString() ?? "";
              else if (ik === "parent" && iv.valueKind === JsonValueKind.string_) builder.parent = iv.getString() ?? "";
              else if (ik === "identifier" && iv.valueKind === JsonValueKind.string_) builder.identifier = iv.getString() ?? "";
              else if (ik === "pre" && iv.valueKind === JsonValueKind.string_) builder.pre = iv.getString() ?? "";
              else if (ik === "post" && iv.valueKind === JsonValueKind.string_) builder.post = iv.getString() ?? "";
              else if (ik === "weight" && iv.valueKind === JsonValueKind.number_) builder.weight = iv.getInt32();
            }
            entries.add(builder);
          }
        }
      }
    }
  }

  doc.dispose();

  // Build menus
  const menus = new Dictionary<string, MenuEntry[]>();
  const menuKeysIt = menuBuilders.keys.getEnumerator();
  while (menuKeysIt.moveNext()) {
    const menuName = menuKeysIt.current;
    const builders = new List<MenuEntryBuilder>();
    const hasBuilders = menuBuilders.tryGetValue(menuName, builders);
    if (hasBuilders) {
      const entries = new List<MenuEntry>();
      const buildersArr = builders.toArray();
      for (let i = 0; i < buildersArr.length; i++) entries.add(buildersArr[i]!.toEntry());
      menus.remove(menuName);
      menus.add(menuName, buildMenuHierarchy(entries.toArray()));
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  if (languages.count > 0) {
    config.languages = sortLanguages(languages.toArray());
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;
  config.Menus = menus;
  return config;
};
