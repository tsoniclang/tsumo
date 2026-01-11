import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import { Int32 } from "@tsonic/dotnet/System.js";
import { JsonDocument, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { int } from "@tsonic/core/types.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "./models.ts";
import { fileExists, readTextFile } from "./fs.ts";
import { ensureTrailingSlash } from "./utils/text.ts";
import { ParamValue } from "./params.ts";
import { buildMenuHierarchy } from "./menus.ts";

class MenuEntryBuilder {
  name: string;
  url: string;
  pageRef: string;
  title: string;
  weight: int;
  parent: string;
  identifier: string;
  pre: string;
  post: string;
  menu: string;
  params: Dictionary<string, ParamValue>;

  constructor(menu: string) {
    this.name = "";
    this.url = "";
    this.pageRef = "";
    this.title = "";
    this.weight = 0;
    this.parent = "";
    this.identifier = "";
    this.pre = "";
    this.post = "";
    this.menu = menu;
    this.params = new Dictionary<string, ParamValue>();
  }

  toEntry(): MenuEntry {
    return new MenuEntry(
      this.name,
      this.url,
      this.pageRef,
      this.title,
      this.weight,
      this.parent,
      this.identifier,
      this.pre,
      this.post,
      this.menu,
      this.params,
    );
  }
}

// Menu hierarchy building moved to menus.ts

export class LoadedConfig {
  readonly path: string | undefined;
  readonly config: SiteConfig;

  constructor(path: string | undefined, config: SiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const tryGetFirstExisting = (paths: string[]): string | undefined => {
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]!;
    if (fileExists(p)) return p;
  }
  return undefined;
};

const unquote = (value: string): string => {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.substring(1, v.length - 2);
  }
  return v;
};

class LanguageConfigBuilder {
  readonly lang: string;
  languageName: string;
  languageDirection: string;
  contentDir: string;
  weight: int;

  constructor(lang: string) {
    this.lang = lang;
    this.languageName = lang;
    this.languageDirection = "ltr";
    this.contentDir = `content.${lang}`;
    this.weight = 0;
  }

  toConfig(): LanguageConfig {
    return new LanguageConfig(this.lang, this.languageName, this.languageDirection, this.contentDir, this.weight);
  }
}

const sortLanguages = (langs: LanguageConfig[]): LanguageConfig[] => {
  const copy = new List<LanguageConfig>();
  for (let i = 0; i < langs.length; i++) copy.add(langs[i]!);
  copy.sort((a: LanguageConfig, b: LanguageConfig) => a.weight - b.weight);
  return copy.toArray();
};

const parseTomlConfig = (text: string): SiteConfig => {
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
        const parsed: int = 0;
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
          const parsed: int = 0;
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
    const builders = new List<MenuEntryBuilder>();
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

const parseYamlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined = undefined;
  let copyright: string | undefined = undefined;
  const params = new Dictionary<string, ParamValue>();
  const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();

  const lines = text.replaceLineEndings("\n").split("\n");

  let inParams = false;
  let inMenu = false;
  let currentMenuName = "";
  let currentMenuEntry: MenuEntryBuilder | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    // Check for top-level sections
    if (!raw.startsWith(" ")) {
      inParams = false;
      inMenu = false;
      currentMenuName = "";
      currentMenuEntry = undefined;
    }

    if (!raw.startsWith(" ") && line.toLowerInvariant() === "params:") {
      inParams = true;
      continue;
    }

    if (!raw.startsWith(" ") && line.toLowerInvariant() === "menu:") {
      inMenu = true;
      continue;
    }

    if (inParams && raw.startsWith("  ") && line.contains(":")) {
      const idx = line.indexOf(":");
      const key = line.substring(0, idx).trim();
      const val = unquote(line.substring(idx + 1).trim());
      params.remove(key);
      params.add(key, ParamValue.parseScalar(val));
      continue;
    }

    // Parse menu entries (YAML format: menu: main: - name: ...)
    if (inMenu) {
      // Menu name at 2 spaces indent (e.g., "  main:")
      if (raw.startsWith("  ") && !raw.startsWith("    ") && line.endsWith(":")) {
        currentMenuName = line.substring(0, line.length - 1).trim();
        if (!menuBuilders.containsKey(currentMenuName)) {
          menuBuilders.add(currentMenuName, new List<MenuEntryBuilder>());
        }
        currentMenuEntry = undefined;
        continue;
      }

      // New menu entry at 4 spaces indent starting with "-"
      if (raw.startsWith("    ") && !raw.startsWith("      ") && line.startsWith("-") && currentMenuName !== "") {
        currentMenuEntry = new MenuEntryBuilder(currentMenuName);
        let entries = new List<MenuEntryBuilder>();
        if (menuBuilders.tryGetValue(currentMenuName, entries)) {
          entries.add(currentMenuEntry);
        }

        // Check for inline entry (e.g., "    - name: About")
        const rest = line.substring(1).trim();
        if (rest.contains(":")) {
          const colonIdx = rest.indexOf(":");
          const propKey = rest.substring(0, colonIdx).trim().toLowerInvariant();
          const propVal = unquote(rest.substring(colonIdx + 1).trim());
          if (propKey === "name") currentMenuEntry.name = propVal;
          else if (propKey === "url") currentMenuEntry.url = propVal;
          else if (propKey === "pageref") currentMenuEntry.pageRef = propVal;
          else if (propKey === "title") currentMenuEntry.title = propVal;
          else if (propKey === "parent") currentMenuEntry.parent = propVal;
          else if (propKey === "identifier") currentMenuEntry.identifier = propVal;
          else if (propKey === "pre") currentMenuEntry.pre = propVal;
          else if (propKey === "post") currentMenuEntry.post = propVal;
          else if (propKey === "weight") {
            const parsed: int = 0;
            if (Int32.tryParse(propVal, parsed)) currentMenuEntry.weight = parsed;
          }
        }
        continue;
      }

      // Menu entry properties at 6 spaces indent
      if (raw.startsWith("      ") && currentMenuEntry !== undefined && line.contains(":")) {
        const colonIdx = line.indexOf(":");
        const propKey = line.substring(0, colonIdx).trim().toLowerInvariant();
        const propVal = unquote(line.substring(colonIdx + 1).trim());
        if (propKey === "name") currentMenuEntry.name = propVal;
        else if (propKey === "url") currentMenuEntry.url = propVal;
        else if (propKey === "pageref") currentMenuEntry.pageRef = propVal;
        else if (propKey === "title") currentMenuEntry.title = propVal;
        else if (propKey === "parent") currentMenuEntry.parent = propVal;
        else if (propKey === "identifier") currentMenuEntry.identifier = propVal;
        else if (propKey === "pre") currentMenuEntry.pre = propVal;
        else if (propKey === "post") currentMenuEntry.post = propVal;
        else if (propKey === "weight") {
          const parsed: int = 0;
          if (Int32.tryParse(propVal, parsed)) currentMenuEntry.weight = parsed;
        }
        continue;
      }
    }

    if (!raw.startsWith(" ") && line.contains(":")) {
      const idx = line.indexOf(":");
      const key = line.substring(0, idx).trim().toLowerInvariant();
      const val = unquote(line.substring(idx + 1).trim());
      if (key === "title") title = val;
      else if (key === "baseurl") baseURL = val;
      else if (key === "languagecode") languageCode = val;
      else if (key === "contentdir") contentDir = val;
      else if (key === "theme") theme = val;
      else if (key === "copyright") copyright = val;
      continue;
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  config.Params = params;

  // Build menus from parsed entries
  const menuKeysIt = menuBuilders.keys.getEnumerator();
  while (menuKeysIt.moveNext()) {
    const menuName = menuKeysIt.current;
    const builders = new List<MenuEntryBuilder>();
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
};

const parseJsonConfig = (text: string): SiteConfig => {
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

export const loadSiteConfig = (siteDir: string): LoadedConfig => {
  const candidates = [
    Path.combine(siteDir, "hugo.toml"),
    Path.combine(siteDir, "hugo.yaml"),
    Path.combine(siteDir, "hugo.yml"),
    Path.combine(siteDir, "hugo.json"),
    Path.combine(siteDir, "config.toml"),
    Path.combine(siteDir, "config.yaml"),
    Path.combine(siteDir, "config.yml"),
    Path.combine(siteDir, "config.json"),
  ];

  const path = tryGetFirstExisting(candidates);
  if (path === undefined) {
    const defaultConfig = new SiteConfig("Tsumo Site", "", "en-us", undefined);
    return new LoadedConfig(undefined, defaultConfig);
  }

  const text = readTextFile(path);
  const lower = path.toLowerInvariant();
  const parsedConfig =
    lower.endsWith(".toml") ? parseTomlConfig(text) : lower.endsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, parsedConfig);
};
