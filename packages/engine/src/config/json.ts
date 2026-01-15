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

  if (root.valueKind === JsonValueKind.object) {
    const props = root.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      const key = p.name.toLowerInvariant();
      const v = p.value;

      if (key === "title" && v.valueKind === JsonValueKind.string) {
        title = v.getString() ?? title;
        continue;
      }
      if (key === "baseurl" && v.valueKind === JsonValueKind.string) {
        baseURL = v.getString() ?? baseURL;
        continue;
      }
      if (key === "languagecode" && v.valueKind === JsonValueKind.string) {
        languageCode = v.getString() ?? languageCode;
        hasLanguageCode = true;
        continue;
      }
      if (key === "contentdir" && v.valueKind === JsonValueKind.string) {
        contentDir = v.getString() ?? contentDir;
        continue;
      }
      if (key === "theme" && v.valueKind === JsonValueKind.string) {
        theme = v.getString();
        continue;
      }
      if (key === "copyright" && v.valueKind === JsonValueKind.string) {
        copyright = v.getString();
        continue;
      }
      if (key === "params" && v.valueKind === JsonValueKind.object) {
        const pp = v.enumerateObject().getEnumerator();
        while (pp.moveNext()) {
          const prop = pp.current;
          const val = prop.value;
          if (val.valueKind === JsonValueKind.string) {
            const s = val.getString();
            if (s !== undefined) {
              params.remove(prop.name);
              params.add(prop.name, ParamValue.string(s));
            }
          } else if (val.valueKind === JsonValueKind.true || val.valueKind === JsonValueKind.false) {
            params.remove(prop.name);
            params.add(prop.name, ParamValue.bool(val.getBoolean()));
          } else if (val.valueKind === JsonValueKind.number) {
            params.remove(prop.name);
            params.add(prop.name, ParamValue.number(val.getInt32()));
          }
        }
      }

      if (key === "languages" && v.valueKind === JsonValueKind.object) {
        const lp = v.enumerateObject().getEnumerator();
        while (lp.moveNext()) {
          const langProp = lp.current;
          if (langProp.value.valueKind !== JsonValueKind.object) continue;
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
            if (ck === "languagename" && cv.valueKind === JsonValueKind.string) languageName = cv.getString() ?? languageName;
            else if (ck === "languagedirection" && cv.valueKind === JsonValueKind.string) languageDirection = cv.getString() ?? languageDirection;
            else if (ck === "contentdir" && cv.valueKind === JsonValueKind.string) langContentDir = cv.getString() ?? langContentDir;
            else if (ck === "weight" && cv.valueKind === JsonValueKind.number) weight = cv.getInt32();
          }

          languages.add(new LanguageConfig(lang, languageName, languageDirection, langContentDir, weight));
        }
      }

      // Parse menu entries
      if (key === "menu" && v.valueKind === JsonValueKind.object) {
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
            if (item.valueKind !== JsonValueKind.object) continue;

            const builder = new MenuEntryBuilder(menuName);
            const itemProps = item.enumerateObject().getEnumerator();
            while (itemProps.moveNext()) {
              const ip = itemProps.current;
              const ik = ip.name.toLowerInvariant();
              const iv = ip.value;
              if (ik === "name" && iv.valueKind === JsonValueKind.string) builder.name = iv.getString() ?? "";
              else if (ik === "url" && iv.valueKind === JsonValueKind.string) builder.url = iv.getString() ?? "";
              else if (ik === "pageref" && iv.valueKind === JsonValueKind.string) builder.pageRef = iv.getString() ?? "";
              else if (ik === "title" && iv.valueKind === JsonValueKind.string) builder.title = iv.getString() ?? "";
              else if (ik === "parent" && iv.valueKind === JsonValueKind.string) builder.parent = iv.getString() ?? "";
              else if (ik === "identifier" && iv.valueKind === JsonValueKind.string) builder.identifier = iv.getString() ?? "";
              else if (ik === "pre" && iv.valueKind === JsonValueKind.string) builder.pre = iv.getString() ?? "";
              else if (ik === "post" && iv.valueKind === JsonValueKind.string) builder.post = iv.getString() ?? "";
              else if (ik === "weight" && iv.valueKind === JsonValueKind.number) builder.weight = iv.getInt32();
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
    let builders = new List<MenuEntryBuilder>();
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
