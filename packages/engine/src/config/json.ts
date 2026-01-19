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

  const doc = JsonDocument.Parse(text);
  const root = doc.RootElement;

  if (root.ValueKind === JsonValueKind.Object) {
    const props = root.EnumerateObject().GetEnumerator();
    while (props.MoveNext()) {
      const p = props.Current;
      const key = p.Name.ToLowerInvariant();
      const v = p.Value;

      if (key === "title" && v.ValueKind === JsonValueKind.String) {
        title = v.GetString() ?? title;
        continue;
      }
      if (key === "baseurl" && v.ValueKind === JsonValueKind.String) {
        baseURL = v.GetString() ?? baseURL;
        continue;
      }
      if (key === "languagecode" && v.ValueKind === JsonValueKind.String) {
        languageCode = v.GetString() ?? languageCode;
        hasLanguageCode = true;
        continue;
      }
      if (key === "contentdir" && v.ValueKind === JsonValueKind.String) {
        contentDir = v.GetString() ?? contentDir;
        continue;
      }
      if (key === "theme" && v.ValueKind === JsonValueKind.String) {
        theme = v.GetString();
        continue;
      }
      if (key === "copyright" && v.ValueKind === JsonValueKind.String) {
        copyright = v.GetString();
        continue;
      }
      if (key === "params" && v.ValueKind === JsonValueKind.Object) {
        const pp = v.EnumerateObject().GetEnumerator();
        while (pp.MoveNext()) {
          const prop = pp.Current;
          const val = prop.Value;
          if (val.ValueKind === JsonValueKind.String) {
            const s = val.GetString();
            if (s !== undefined) {
              params.Remove(prop.Name);
              params.Add(prop.Name, ParamValue.string(s));
            }
          } else if (val.ValueKind === JsonValueKind.True || val.ValueKind === JsonValueKind.False) {
            params.Remove(prop.Name);
            params.Add(prop.Name, ParamValue.bool(val.GetBoolean()));
          } else if (val.ValueKind === JsonValueKind.Number) {
            params.Remove(prop.Name);
            params.Add(prop.Name, ParamValue.number(val.GetInt32()));
          }
        }
      }

      if (key === "languages" && v.ValueKind === JsonValueKind.Object) {
        const lp = v.EnumerateObject().GetEnumerator();
        while (lp.MoveNext()) {
          const langProp = lp.Current;
          if (langProp.Value.ValueKind !== JsonValueKind.Object) continue;
          const lang = langProp.Name;

          let languageName = lang;
          let languageDirection = "ltr";
          let langContentDir = `content.${lang}`;
          let weight: int = 0;

          const cfgProps = langProp.Value.EnumerateObject().GetEnumerator();
          while (cfgProps.MoveNext()) {
            const c = cfgProps.Current;
            const ck = c.Name.ToLowerInvariant();
            const cv = c.Value;
            if (ck === "languagename" && cv.ValueKind === JsonValueKind.String) languageName = cv.GetString() ?? languageName;
            else if (ck === "languagedirection" && cv.ValueKind === JsonValueKind.String) languageDirection = cv.GetString() ?? languageDirection;
            else if (ck === "contentdir" && cv.ValueKind === JsonValueKind.String) langContentDir = cv.GetString() ?? langContentDir;
            else if (ck === "weight" && cv.ValueKind === JsonValueKind.Number) weight = cv.GetInt32();
          }

          languages.Add(new LanguageConfig(lang, languageName, languageDirection, langContentDir, weight));
        }
      }

      // Parse menu entries
      if (key === "menu" && v.ValueKind === JsonValueKind.Object) {
        const menuProps = v.EnumerateObject().GetEnumerator();
        while (menuProps.MoveNext()) {
          const menuProp = menuProps.Current;
          const menuName = menuProp.Name;
          if (menuProp.Value.ValueKind !== JsonValueKind.Array) continue;

          let entries = new List<MenuEntryBuilder>();
          const hasMenu = menuBuilders.TryGetValue(menuName, entries);
          if (!hasMenu) {
            entries = new List<MenuEntryBuilder>();
            menuBuilders.Remove(menuName);
            menuBuilders.Add(menuName, entries);
          }

          const menuItems = menuProp.Value.EnumerateArray().GetEnumerator();
          while (menuItems.MoveNext()) {
            const item = menuItems.Current;
            if (item.ValueKind !== JsonValueKind.Object) continue;

            const builder = new MenuEntryBuilder(menuName);
            const itemProps = item.EnumerateObject().GetEnumerator();
            while (itemProps.MoveNext()) {
              const ip = itemProps.Current;
              const ik = ip.Name.ToLowerInvariant();
              const iv = ip.Value;
              if (ik === "name" && iv.ValueKind === JsonValueKind.String) builder.name = iv.GetString() ?? "";
              else if (ik === "url" && iv.ValueKind === JsonValueKind.String) builder.url = iv.GetString() ?? "";
              else if (ik === "pageref" && iv.ValueKind === JsonValueKind.String) builder.pageRef = iv.GetString() ?? "";
              else if (ik === "title" && iv.ValueKind === JsonValueKind.String) builder.title = iv.GetString() ?? "";
              else if (ik === "parent" && iv.ValueKind === JsonValueKind.String) builder.parent = iv.GetString() ?? "";
              else if (ik === "identifier" && iv.ValueKind === JsonValueKind.String) builder.identifier = iv.GetString() ?? "";
              else if (ik === "pre" && iv.ValueKind === JsonValueKind.String) builder.pre = iv.GetString() ?? "";
              else if (ik === "post" && iv.ValueKind === JsonValueKind.String) builder.post = iv.GetString() ?? "";
              else if (ik === "weight" && iv.ValueKind === JsonValueKind.Number) builder.weight = iv.GetInt32();
            }
            entries.Add(builder);
          }
        }
      }
    }
  }

  doc.Dispose();

  // Build menus
  const menus = new Dictionary<string, MenuEntry[]>();
  const menuKeysIt = menuBuilders.Keys.GetEnumerator();
  while (menuKeysIt.MoveNext()) {
    const menuName = menuKeysIt.Current;
    let builders = new List<MenuEntryBuilder>();
    const hasBuilders = menuBuilders.TryGetValue(menuName, builders);
    if (hasBuilders) {
      const entries = new List<MenuEntry>();
      const buildersArr = builders.ToArray();
      for (let i = 0; i < buildersArr.Length; i++) entries.Add(buildersArr[i]!.toEntry());
      menus.Remove(menuName);
      menus.Add(menuName, buildMenuHierarchy(entries.ToArray()));
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  if (languages.Count > 0) {
    config.languages = sortLanguages(languages.ToArray());
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  config.Params = params;
  config.Menus = menus;
  return config;
};
