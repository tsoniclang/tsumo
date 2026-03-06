import { Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { unquote } from "./helpers.ts";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";

export const parseYamlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined = undefined;
  let copyright: string | undefined = undefined;
  const params = new Dictionary<string, ParamValue>();
  const menuBuilders = new Dictionary<string, List<MenuEntryBuilder>>();

  const lines = replaceLineEndings(text, "\n").split("\n");

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

    if (!raw.startsWith(" ") && line.toLowerCase() === "params:") {
      inParams = true;
      continue;
    }

    if (!raw.startsWith(" ") && line.toLowerCase() === "menu:") {
      inMenu = true;
      continue;
    }

    if (inParams && raw.startsWith("  ") && line.includes(":")) {
      const idx = line.indexOf(":");
      const key = substringCount(line, 0, idx).trim();
      const val = unquote(substringFrom(line, idx + 1).trim());
      params.Remove(key);
      params.Add(key, ParamValue.parseScalar(val));
      continue;
    }

    // Parse menu entries (YAML format: menu: main: - name: ...)
    if (inMenu) {
      // Menu name at 2 spaces indent (e.g., "  main:")
      if (raw.startsWith("  ") && !raw.startsWith("    ") && line.endsWith(":")) {
        currentMenuName = substringCount(line, 0, line.length - 1).trim();
        if (!menuBuilders.ContainsKey(currentMenuName)) {
          menuBuilders.Add(currentMenuName, new List<MenuEntryBuilder>());
        }
        currentMenuEntry = undefined;
        continue;
      }

      // New menu entry at 4 spaces indent starting with "-"
      if (raw.startsWith("    ") && !raw.startsWith("      ") && line.startsWith("-") && currentMenuName !== "") {
        currentMenuEntry = new MenuEntryBuilder(currentMenuName);
        let entries = new List<MenuEntryBuilder>();
        if (menuBuilders.TryGetValue(currentMenuName, entries)) {
          entries.Add(currentMenuEntry);
        }

        // Check for inline entry (e.g., "    - name: About")
        const rest = substringFrom(line, 1).trim();
        if (rest.includes(":")) {
          const colonIdx = rest.indexOf(":");
          const propKey = substringCount(rest, 0, colonIdx).trim().toLowerCase();
          const propVal = unquote(substringFrom(rest, colonIdx + 1).trim());
          if (propKey === "name") currentMenuEntry.name = propVal;
          else if (propKey === "url") currentMenuEntry.url = propVal;
          else if (propKey === "pageref") currentMenuEntry.pageRef = propVal;
          else if (propKey === "title") currentMenuEntry.title = propVal;
          else if (propKey === "parent") currentMenuEntry.parent = propVal;
          else if (propKey === "identifier") currentMenuEntry.identifier = propVal;
          else if (propKey === "pre") currentMenuEntry.pre = propVal;
          else if (propKey === "post") currentMenuEntry.post = propVal;
          else if (propKey === "weight") {
            let parsed: int = 0;
            if (Int32.TryParse(propVal, parsed)) currentMenuEntry.weight = parsed;
          }
        }
        continue;
      }

      // Menu entry properties at 6 spaces indent
      if (raw.startsWith("      ") && currentMenuEntry !== undefined && line.includes(":")) {
        const colonIdx = line.indexOf(":");
        const propKey = substringCount(line, 0, colonIdx).trim().toLowerCase();
        const propVal = unquote(substringFrom(line, colonIdx + 1).trim());
        if (propKey === "name") currentMenuEntry.name = propVal;
        else if (propKey === "url") currentMenuEntry.url = propVal;
        else if (propKey === "pageref") currentMenuEntry.pageRef = propVal;
        else if (propKey === "title") currentMenuEntry.title = propVal;
        else if (propKey === "parent") currentMenuEntry.parent = propVal;
        else if (propKey === "identifier") currentMenuEntry.identifier = propVal;
        else if (propKey === "pre") currentMenuEntry.pre = propVal;
        else if (propKey === "post") currentMenuEntry.post = propVal;
        else if (propKey === "weight") {
          let parsed: int = 0;
          if (Int32.TryParse(propVal, parsed)) currentMenuEntry.weight = parsed;
        }
        continue;
      }
    }

    if (!raw.startsWith(" ") && line.includes(":")) {
      const idx = line.indexOf(":");
      const key = substringCount(line, 0, idx).trim().toLowerCase();
      const val = unquote(substringFrom(line, idx + 1).trim());
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
  const menuKeysIt = menuBuilders.Keys.GetEnumerator();
  while (menuKeysIt.MoveNext()) {
    const menuName = menuKeysIt.Current;
    let builders = new List<MenuEntryBuilder>();
    const hasBuilders = menuBuilders.TryGetValue(menuName, builders);
    if (hasBuilders) {
      const entries = new List<MenuEntry>();
      const buildersArr = builders.ToArray();
      for (let j = 0; j < buildersArr.length; j++) entries.Add(buildersArr[j]!.toEntry());
      config.Menus.Remove(menuName);
      config.Menus.Add(menuName, buildMenuHierarchy(entries.ToArray()));
    }
  }

  return config;
};

/**
 * Merge YAML config into an existing SiteConfig.
 * For split configs, this handles hugo.yaml, params.yaml, etc.
 */
export const mergeYamlIntoConfig = (config: SiteConfig, text: string, fileName: string): SiteConfig => {
  const lowerFileName = fileName.toLowerCase();

  // For base config files, parse and merge the key fields
  if (lowerFileName === "hugo.yaml" || lowerFileName === "hugo.yml" || lowerFileName === "config.yaml" || lowerFileName === "config.yml") {
    const parsed = parseYamlConfig(text);
    if (parsed.title !== "Tsumo Site") config.title = parsed.title;
    if (parsed.baseURL !== "") config.baseURL = parsed.baseURL;
    if (parsed.languageCode !== "en-us") config.languageCode = parsed.languageCode;
    if (parsed.theme !== undefined) config.theme = parsed.theme;
    if (parsed.copyright !== undefined) config.copyright = parsed.copyright;
    if (parsed.contentDir !== "content") config.contentDir = parsed.contentDir;

    // Merge params
    const paramsIt = parsed.Params.GetEnumerator();
    while (paramsIt.MoveNext()) {
      config.Params.Remove(paramsIt.Current.Key);
      config.Params.Add(paramsIt.Current.Key, paramsIt.Current.Value);
    }

    // Merge menus
    const menusIt = parsed.Menus.GetEnumerator();
    while (menusIt.MoveNext()) {
      config.Menus.Remove(menusIt.Current.Key);
      config.Menus.Add(menusIt.Current.Key, menusIt.Current.Value);
    }
    return config;
  }

  // For params.yaml, parse all keys as params
  if (lowerFileName === "params.yaml" || lowerFileName === "params.yml") {
    const lines = replaceLineEndings(text, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      if (raw.startsWith(" ")) continue; // Skip nested for now

      if (line.includes(":")) {
        const idx = line.indexOf(":");
        const key = substringCount(line, 0, idx).trim();
        const val = unquote(substringFrom(line, idx + 1).trim());
        config.Params.Remove(key);
        config.Params.Add(key, ParamValue.parseScalar(val));
      }
    }
    return config;
  }

  return config;
};
