import { Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { MenuEntry, SiteConfig } from "../models.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { unquote } from "./helpers.ts";

export const parseYamlConfig = (text: string): SiteConfig => {
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
            let parsed: int = 0;
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
          let parsed: int = 0;
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
};

/**
 * Merge YAML config into an existing SiteConfig.
 * For split configs, this handles hugo.yaml, params.yaml, etc.
 */
export const mergeYamlIntoConfig = (config: SiteConfig, text: string, fileName: string): SiteConfig => {
  const lowerFileName = fileName.toLowerInvariant();

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
    const paramsIt = parsed.Params.getEnumerator();
    while (paramsIt.moveNext()) {
      config.Params.remove(paramsIt.current.key);
      config.Params.add(paramsIt.current.key, paramsIt.current.value);
    }

    // Merge menus
    const menusIt = parsed.Menus.getEnumerator();
    while (menusIt.moveNext()) {
      config.Menus.remove(menusIt.current.key);
      config.Menus.add(menusIt.current.key, menusIt.current.value);
    }
    return config;
  }

  // For params.yaml, parse all keys as params
  if (lowerFileName === "params.yaml" || lowerFileName === "params.yml") {
    const lines = text.replaceLineEndings("\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      if (raw.startsWith(" ")) continue; // Skip nested for now

      if (line.contains(":")) {
        const idx = line.indexOf(":");
        const key = line.substring(0, idx).trim();
        const val = unquote(line.substring(idx + 1).trim());
        config.Params.remove(key);
        config.Params.add(key, ParamValue.parseScalar(val));
      }
    }
    return config;
  }

  return config;
};
