import type { int, JsValue } from "@tsonic/core/types.js";
import { ParamValue } from "../params.ts";
import { FrontMatterMenu } from "./menu.ts";
import { FrontMatter } from "./data.ts";
import { ParsedContent } from "./parsed-content.ts";
import { parseInt32, toInt32 } from "../utils/int32.ts";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";

const isObject = (value: JsValue): value is Record<string, JsValue> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const tryParseInt = (value: string): int | undefined => parseInt32(value);

const tryParseDate = (value: string): Date | undefined => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return substringCount(trimmed, 1, trimmed.length - 2);
  }
  return trimmed;
};

const parseBool = (value: string): boolean | undefined => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
};

const parseStringArrayInline = (value: string): string[] | undefined => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;

  const inner = substringCount(trimmed, 1, trimmed.length - 2).trim();
  if (inner === "") return [];

  const parts = inner.split(",");
  const items: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const item = unquote(parts[i]!);
    if (item !== "") items.push(item);
  }
  return items;
};

const applyScalar = (fm: FrontMatter, keyRaw: string, valueRaw: string): void => {
  const key = keyRaw.trim().toLowerCase();
  const value = valueRaw.trim();

  if (key === "title") {
    fm.title = unquote(value);
    return;
  }

  if (key === "date") {
    const parsed = tryParseDate(unquote(value));
    if (parsed !== undefined) fm.date = parsed;
    return;
  }

  if (key === "draft") {
    const parsed = parseBool(value);
    if (parsed !== undefined) fm.draft = parsed;
    return;
  }

  if (key === "description") {
    fm.description = unquote(value);
    return;
  }

  if (key === "slug") {
    fm.slug = unquote(value);
    return;
  }

  if (key === "layout") {
    fm.layout = unquote(value);
    return;
  }

  if (key === "type") {
    fm.type = unquote(value);
    return;
  }

  if (key === "tags") {
    const parsed = parseStringArrayInline(value);
    if (parsed !== undefined) fm.tags = parsed;
    return;
  }

  if (key === "categories") {
    const parsed = parseStringArrayInline(value);
    if (parsed !== undefined) fm.categories = parsed;
    return;
  }

  fm.Params.set(keyRaw.trim(), ParamValue.parseScalar(unquote(value)));
};

const applyArray = (fm: FrontMatter, keyRaw: string, items: string[]): void => {
  const key = keyRaw.trim().toLowerCase();
  if (key === "tags") fm.tags = items;
  else if (key === "categories") fm.categories = items;
};

const parseYaml = (all: string[]): FrontMatter => {
  const fm = new FrontMatter();

  for (let i = 0; i < all.length; i++) {
    const line = all[i]!;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (!line.startsWith(" ") && trimmed.includes(":")) {
      const idx = trimmed.indexOf(":");
      const key = substringCount(trimmed, 0, idx).trim();
      const rest = substringFrom(trimmed, idx + 1).trim();

      if (rest !== "") {
        applyScalar(fm, key, rest);
        continue;
      }

      const keyLower = key.toLowerCase();
      if (keyLower === "params") {
        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;
          const nextTrimmed = next.trim();
          if (nextTrimmed === "" || nextTrimmed.startsWith("#") || !nextTrimmed.includes(":")) continue;
          const nextIdx = nextTrimmed.indexOf(":");
          const paramKey = substringCount(nextTrimmed, 0, nextIdx).trim();
          const paramValue = substringFrom(nextTrimmed, nextIdx + 1).trim();
          fm.Params.set(paramKey, ParamValue.parseScalar(unquote(paramValue)));
        }
        continue;
      }

      if (keyLower === "tags" || keyLower === "categories") {
        const items: string[] = [];
        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;
          const nextTrimmed = next.trim();
          if (!nextTrimmed.startsWith("-")) continue;
          const item = substringFrom(nextTrimmed, 1).trim();
          if (item !== "") items.push(unquote(item));
        }
        applyArray(fm, key, items);
        continue;
      }

      if (keyLower === "menu") {
        const menuItems: FrontMatterMenu[] = [];
        let currentMenu: FrontMatterMenu | undefined;

        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;

          if (next.startsWith("  ") && !next.startsWith("    ")) {
            const nextTrimmed = next.trim();
            if (nextTrimmed === "" || nextTrimmed.startsWith("#")) continue;

            if (nextTrimmed.endsWith(":")) {
              if (currentMenu !== undefined) menuItems.push(currentMenu);
              currentMenu = new FrontMatterMenu(substringCount(nextTrimmed, 0, nextTrimmed.length - 1).trim());
            } else if (nextTrimmed.includes(":")) {
              const colonIdx = nextTrimmed.indexOf(":");
              const menuName = substringCount(nextTrimmed, 0, colonIdx).trim();
              if (currentMenu !== undefined) menuItems.push(currentMenu);
              menuItems.push(new FrontMatterMenu(menuName));
              currentMenu = undefined;
            }
            continue;
          }

          if (currentMenu !== undefined && next.startsWith("    ")) {
            const nextTrimmed = next.trim();
            if (nextTrimmed === "" || nextTrimmed.startsWith("#") || !nextTrimmed.includes(":")) continue;
            const colonIdx = nextTrimmed.indexOf(":");
            const propKey = substringCount(nextTrimmed, 0, colonIdx).trim().toLowerCase();
            const propValue = unquote(substringFrom(nextTrimmed, colonIdx + 1).trim());

            if (propKey === "weight") {
              const parsed = tryParseInt(propValue);
              if (parsed !== undefined) currentMenu.weight = parsed;
            } else if (propKey === "name") currentMenu.name = propValue;
            else if (propKey === "parent") currentMenu.parent = propValue;
            else if (propKey === "identifier") currentMenu.identifier = propValue;
            else if (propKey === "pre") currentMenu.pre = propValue;
            else if (propKey === "post") currentMenu.post = propValue;
            else if (propKey === "title") currentMenu.title = propValue;
          }
        }

        if (currentMenu !== undefined) menuItems.push(currentMenu);
        fm.menus = menuItems;
      }
    }
  }

  return fm;
};

const parseToml = (lines: string[]): FrontMatter => {
  const fm = new FrontMatter();
  let currentTable = "";
  const menuBuilders = new Map<string, FrontMatterMenu[]>();
  let currentMenu: FrontMatterMenu | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const tableName = substringCount(line, 2, line.length - 4).trim().toLowerCase();
      if (tableName.startsWith("menu.")) {
        const menuName = substringFrom(tableName, 5).trim();
        currentMenu = new FrontMatterMenu(menuName);
        const entries = menuBuilders.get(menuName) ?? [];
        entries.push(currentMenu);
        menuBuilders.set(menuName, entries);
        currentTable = tableName;
      } else {
        currentTable = tableName;
        currentMenu = undefined;
      }
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentTable = substringCount(line, 1, line.length - 2).trim().toLowerCase();
      currentMenu = undefined;
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const keyRaw = substringCount(line, 0, eq).trim();
    const valueRaw = substringFrom(line, eq + 1).trim();

    if (currentMenu !== undefined && currentTable.startsWith("menu.")) {
      const keyLower = keyRaw.toLowerCase();
      if (keyLower === "weight") {
        const parsed = tryParseInt(unquote(valueRaw));
        if (parsed !== undefined) currentMenu.weight = parsed;
      } else if (keyLower === "name") currentMenu.name = unquote(valueRaw);
      else if (keyLower === "parent") currentMenu.parent = unquote(valueRaw);
      else if (keyLower === "identifier") currentMenu.identifier = unquote(valueRaw);
      else if (keyLower === "pre") currentMenu.pre = unquote(valueRaw);
      else if (keyLower === "post") currentMenu.post = unquote(valueRaw);
      else if (keyLower === "title") currentMenu.title = unquote(valueRaw);
      continue;
    }

    if (currentTable === "params") {
      fm.Params.set(keyRaw, ParamValue.parseScalar(unquote(valueRaw)));
      continue;
    }

    if (keyRaw.toLowerCase() === "tags") {
      const parsed = parseStringArrayInline(valueRaw);
      if (parsed !== undefined) fm.tags = parsed;
      continue;
    }

    if (keyRaw.toLowerCase() === "categories") {
      const parsed = parseStringArrayInline(valueRaw);
      if (parsed !== undefined) fm.categories = parsed;
      continue;
    }

    if (keyRaw.toLowerCase() === "draft") {
      const parsed = parseBool(valueRaw);
      if (parsed !== undefined) fm.draft = parsed;
      continue;
    }

    if (keyRaw.toLowerCase() === "date") {
      const parsed = tryParseDate(unquote(valueRaw));
      if (parsed !== undefined) fm.date = parsed;
      continue;
    }

    applyScalar(fm, keyRaw, valueRaw);
  }

  const allMenus: FrontMatterMenu[] = [];
  for (const entries of menuBuilders.values()) {
    for (let i = 0; i < entries.length; i++) allMenus.push(entries[i]!);
  }
  fm.menus = allMenus;

  return fm;
};

const parseJsonStringArray = (value: JsValue): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const values = value as JsValue[];
  const items: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    if (typeof current === "string") items.push(current);
  }
  return items;
};

const parseJson = (json: string): FrontMatter => {
  const fm = new FrontMatter();
  const root = JSON.parse(json) as JsValue;
  if (!isObject(root)) return fm;

  for (const [rawKey, value] of Object.entries(root)) {
    const key = rawKey.toLowerCase();

    if (key === "title" && typeof value === "string") fm.title = value;
    else if (key === "description" && typeof value === "string") fm.description = value;
    else if (key === "slug" && typeof value === "string") fm.slug = value;
    else if (key === "layout" && typeof value === "string") fm.layout = value;
    else if (key === "type" && typeof value === "string") fm.type = value;
    else if (key === "draft" && typeof value === "boolean") fm.draft = value;
    else if (key === "date" && typeof value === "string") {
      const parsed = tryParseDate(value);
      if (parsed !== undefined) fm.date = parsed;
    } else if (key === "tags") {
      const parsed = parseJsonStringArray(value);
      if (parsed !== undefined) fm.tags = parsed;
    } else if (key === "categories") {
      const parsed = parseJsonStringArray(value);
      if (parsed !== undefined) fm.categories = parsed;
    } else if (key === "params" && isObject(value)) {
      const paramEntries = Object.entries(value as Record<string, JsValue>);
      for (let i = 0; i < paramEntries.length; i++) {
        const [paramKey, paramValue] = paramEntries[i]!;
        if (typeof paramValue === "string") fm.Params.set(paramKey, ParamValue.string(paramValue));
        else if (typeof paramValue === "boolean") fm.Params.set(paramKey, ParamValue.bool(paramValue));
        else if (typeof paramValue === "number") {
          const narrowed = toInt32(paramValue);
          if (narrowed !== undefined) {
            fm.Params.set(paramKey, ParamValue.number(narrowed));
          }
        }
      }
    } else if (key === "menu" && isObject(value)) {
      const menuItems: FrontMatterMenu[] = [];
      const menuEntries = Object.entries(value as Record<string, JsValue>);
      for (let i = 0; i < menuEntries.length; i++) {
        const [menuName, menuValue] = menuEntries[i]!;
        const entry = new FrontMatterMenu(menuName);
        if (isObject(menuValue)) {
          const entryPairs = Object.entries(menuValue as Record<string, JsValue>);
          for (let j = 0; j < entryPairs.length; j++) {
            const [entryKeyRaw, entryValue] = entryPairs[j]!;
            const entryKey = entryKeyRaw.toLowerCase();
            if (entryKey === "weight" && typeof entryValue === "number") {
              const narrowed = toInt32(entryValue);
              if (narrowed !== undefined) {
                entry.weight = narrowed;
              }
            }
            else if (entryKey === "name" && typeof entryValue === "string") entry.name = entryValue;
            else if (entryKey === "parent" && typeof entryValue === "string") entry.parent = entryValue;
            else if (entryKey === "identifier" && typeof entryValue === "string") entry.identifier = entryValue;
            else if (entryKey === "pre" && typeof entryValue === "string") entry.pre = entryValue;
            else if (entryKey === "post" && typeof entryValue === "string") entry.post = entryValue;
            else if (entryKey === "title" && typeof entryValue === "string") entry.title = entryValue;
          }
        }
        menuItems.push(entry);
      }
      fm.menus = menuItems;
    }
  }

  return fm;
};

const tryParseJsonFrontMatter = (text: string): ParsedContent | undefined => {
  const chars = text.split("");
  let start = 0;
  while (start < chars.length && /\s/.test(chars[start]!)) start++;
  if (start >= chars.length || chars[start] !== "{") return undefined;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let end = -1;

  for (let i = start; i < chars.length; i++) {
    const current = chars[i]!;
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (current === "\\") {
      escapeNext = true;
      continue;
    }
    if (current === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (current === "{") depth++;
    if (current === "}") depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end <= start) return undefined;
  const json = substringCount(text, start, end - start);
  const body = substringFrom(text, end).trimStart();
  return new ParsedContent(parseJson(json), body);
};

export const parseContent = (text: string): ParsedContent => {
  const json = tryParseJsonFrontMatter(text);
  if (json !== undefined) return json;

  const normalized = replaceLineEndings(text, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) return new ParsedContent(new FrontMatter(), "");

  const firstLine = lines[0]!;
  if (firstLine.trim() === "---") {
    const fmLines: string[] = [];
    let bodyStart = lines.length;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === "---") {
        bodyStart = i + 1;
        break;
      }
      fmLines.push(line);
    }
    const body = lines.slice(bodyStart).join("\n").trimStart();
    return new ParsedContent(parseYaml(fmLines), body);
  }

  if (firstLine.trim() === "+++") {
    const fmLines: string[] = [];
    let bodyStart = lines.length;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === "+++") {
        bodyStart = i + 1;
        break;
      }
      fmLines.push(line);
    }
    const body = lines.slice(bodyStart).join("\n").trimStart();
    return new ParsedContent(parseToml(fmLines), body);
  }

  return new ParsedContent(new FrontMatter(), text);
};
