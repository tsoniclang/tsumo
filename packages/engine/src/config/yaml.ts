import type { int } from "@tsonic/core/types.js";
import { MenuEntry, SiteConfig } from "../models.ts";
import { parseInt32 } from "../utils/int32.ts";
import { ensureTrailingSlash } from "../utils/text.ts";
import { ParamValue } from "../params.ts";
import { buildMenuHierarchy } from "../menus.ts";
import { MenuEntryBuilder } from "./builders.ts";
import { unquote } from "./helpers.ts";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";

const tryParseInt = (value: string): int | undefined => parseInt32(value);

export const parseYamlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined;
  let copyright: string | undefined;
  const params = new Map<string, ParamValue>();
  const menuBuilders = new Map<string, MenuEntryBuilder[]>();

  const lines = replaceLineEndings(text, "\n").split("\n");

  let inParams = false;
  let inMenu = false;
  let currentMenuName = "";
  let currentMenuEntry: MenuEntryBuilder | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

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
      params.set(key, ParamValue.parseScalar(val));
      continue;
    }

    if (inMenu) {
      if (raw.startsWith("  ") && !raw.startsWith("    ") && line.endsWith(":")) {
        currentMenuName = substringCount(line, 0, line.length - 1).trim();
        if (!menuBuilders.has(currentMenuName)) {
          menuBuilders.set(currentMenuName, []);
        }
        currentMenuEntry = undefined;
        continue;
      }

      if (raw.startsWith("    ") && !raw.startsWith("      ") && line.startsWith("-") && currentMenuName !== "") {
        currentMenuEntry = new MenuEntryBuilder(currentMenuName);
        const entries = menuBuilders.get(currentMenuName) ?? [];
        entries.push(currentMenuEntry);
        menuBuilders.set(currentMenuName, entries);

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
            const parsed = tryParseInt(propVal);
            if (parsed !== undefined) currentMenuEntry.weight = parsed;
          }
        }
        continue;
      }

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
          const parsed = tryParseInt(propVal);
          if (parsed !== undefined) currentMenuEntry.weight = parsed;
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
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  config.Params = params;

  for (const [menuName, builders] of menuBuilders) {
    const entries: MenuEntry[] = [];
    for (let i = 0; i < builders.length; i++) entries.push(builders[i]!.toEntry());
    config.Menus.set(menuName, buildMenuHierarchy(entries));
  }

  return config;
};

export const mergeYamlIntoConfig = (config: SiteConfig, text: string, fileName: string): SiteConfig => {
  const lowerFileName = fileName.toLowerCase();

  if (lowerFileName === "hugo.yaml" || lowerFileName === "hugo.yml" || lowerFileName === "config.yaml" || lowerFileName === "config.yml") {
    const parsed = parseYamlConfig(text);
    if (parsed.title !== "Tsumo Site") config.title = parsed.title;
    if (parsed.baseURL !== "") config.baseURL = parsed.baseURL;
    if (parsed.languageCode !== "en-us") config.languageCode = parsed.languageCode;
    if (parsed.theme !== undefined) config.theme = parsed.theme;
    if (parsed.copyright !== undefined) config.copyright = parsed.copyright;
    if (parsed.contentDir !== "content") config.contentDir = parsed.contentDir;

    for (const [key, value] of parsed.Params) config.Params.set(key, value);
    for (const [key, value] of parsed.Menus) config.Menus.set(key, value);
    return config;
  }

  if (lowerFileName === "params.yaml" || lowerFileName === "params.yml") {
    const lines = replaceLineEndings(text, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;
      if (raw.startsWith(" ")) continue;

      if (line.includes(":")) {
        const idx = line.indexOf(":");
        const key = substringCount(line, 0, idx).trim();
        const val = unquote(substringFrom(line, idx + 1).trim());
        config.Params.set(key, ParamValue.parseScalar(val));
      }
    }
  }

  return config;
};
