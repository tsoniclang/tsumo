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

  const lines = text.ReplaceLineEndings("\n").Split("\n");

  let inParams = false;
  let inMenu = false;
  let currentMenuName = "";
  let currentMenuEntry: MenuEntryBuilder | undefined = undefined;

  for (let i = 0; i < lines.Length; i++) {
    const raw = lines[i]!;
    const line = raw.Trim();
    if (line === "" || line.StartsWith("#")) continue;

    // Check for top-level sections
    if (!raw.StartsWith(" ")) {
      inParams = false;
      inMenu = false;
      currentMenuName = "";
      currentMenuEntry = undefined;
    }

    if (!raw.StartsWith(" ") && line.ToLowerInvariant() === "params:") {
      inParams = true;
      continue;
    }

    if (!raw.StartsWith(" ") && line.ToLowerInvariant() === "menu:") {
      inMenu = true;
      continue;
    }

    if (inParams && raw.StartsWith("  ") && line.Contains(":")) {
      const idx = line.IndexOf(":");
      const key = line.Substring(0, idx).Trim();
      const val = unquote(line.Substring(idx + 1).Trim());
      params.Remove(key);
      params.Add(key, ParamValue.parseScalar(val));
      continue;
    }

    // Parse menu entries (YAML format: menu: main: - name: ...)
    if (inMenu) {
      // Menu name at 2 spaces indent (e.g., "  main:")
      if (raw.StartsWith("  ") && !raw.StartsWith("    ") && line.EndsWith(":")) {
        currentMenuName = line.Substring(0, line.Length - 1).Trim();
        if (!menuBuilders.ContainsKey(currentMenuName)) {
          menuBuilders.Add(currentMenuName, new List<MenuEntryBuilder>());
        }
        currentMenuEntry = undefined;
        continue;
      }

      // New menu entry at 4 spaces indent starting with "-"
      if (raw.StartsWith("    ") && !raw.StartsWith("      ") && line.StartsWith("-") && currentMenuName !== "") {
        currentMenuEntry = new MenuEntryBuilder(currentMenuName);
        let entries = new List<MenuEntryBuilder>();
        if (menuBuilders.TryGetValue(currentMenuName, entries)) {
          entries.Add(currentMenuEntry);
        }

        // Check for inline entry (e.g., "    - name: About")
        const rest = line.Substring(1).Trim();
        if (rest.Contains(":")) {
          const colonIdx = rest.IndexOf(":");
          const propKey = rest.Substring(0, colonIdx).Trim().ToLowerInvariant();
          const propVal = unquote(rest.Substring(colonIdx + 1).Trim());
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
      if (raw.StartsWith("      ") && currentMenuEntry !== undefined && line.Contains(":")) {
        const colonIdx = line.IndexOf(":");
        const propKey = line.Substring(0, colonIdx).Trim().ToLowerInvariant();
        const propVal = unquote(line.Substring(colonIdx + 1).Trim());
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

    if (!raw.StartsWith(" ") && line.Contains(":")) {
      const idx = line.IndexOf(":");
      const key = line.Substring(0, idx).Trim().ToLowerInvariant();
      const val = unquote(line.Substring(idx + 1).Trim());
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
      for (let j = 0; j < buildersArr.Length; j++) entries.Add(buildersArr[j]!.toEntry());
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
  const lowerFileName = fileName.ToLowerInvariant();

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
    const lines = text.ReplaceLineEndings("\n").Split("\n");
    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;
      if (raw.StartsWith(" ")) continue; // Skip nested for now

      if (line.Contains(":")) {
        const idx = line.IndexOf(":");
        const key = line.Substring(0, idx).Trim();
        const val = unquote(line.Substring(idx + 1).Trim());
        config.Params.Remove(key);
        config.Params.Add(key, ParamValue.parseScalar(val));
      }
    }
    return config;
  }

  return config;
};
