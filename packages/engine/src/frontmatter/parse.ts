import type { int } from "@tsonic/core/types.js";
import { ParamValue } from "../params.ts";
import { FrontMatterMenu } from "./menu.ts";
import { FrontMatter } from "./data.ts";
import { ParsedContent } from "./parsed-content.ts";
import { parseInt32, toInt32 } from "../utils/int32.ts";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";
import { JsonArray, JsonBool, JsonNumber, JsonObject, JsonString, parseJson as parseJsonValue, type JsonValue } from "../utils/json.ts";

const tryParseInt = (value: string): int | undefined => parseInt32(value);

const tryParseDate = (value: string): Date | undefined => {
  const parsed = new Date(Date.parse(value));
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

const parseJsonStringArray = (value: JsonValue): string[] | undefined => {
  if (!(value instanceof JsonArray)) return undefined;
  const values = value.items;
  const items: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const current = values[i];
    if (current instanceof JsonString) items.push(current.value);
  }
  return items;
};

const parseJson = (json: string): FrontMatter => {
  const fm = new FrontMatter();
  const root = parseJsonValue(json);
  if (!(root instanceof JsonObject)) return fm;

  for (const property of root.properties) {
    const value = property.value;
    const key = property.key.toLowerCase();

    if (key === "title" && value instanceof JsonString) fm.title = value.value;
    else if (key === "description" && value instanceof JsonString) fm.description = value.value;
    else if (key === "slug" && value instanceof JsonString) fm.slug = value.value;
    else if (key === "layout" && value instanceof JsonString) fm.layout = value.value;
    else if (key === "type" && value instanceof JsonString) fm.type = value.value;
    else if (key === "draft" && value instanceof JsonBool) fm.draft = value.value;
    else if (key === "date" && value instanceof JsonString) {
      const parsed = tryParseDate(value.value);
      if (parsed !== undefined) fm.date = parsed;
    } else if (key === "tags") {
      const parsed = parseJsonStringArray(value);
      if (parsed !== undefined) fm.tags = parsed;
    } else if (key === "categories") {
      const parsed = parseJsonStringArray(value);
      if (parsed !== undefined) fm.categories = parsed;
    } else if (key === "params" && value instanceof JsonObject) {
      const paramEntries = value.properties;
      for (let i = 0; i < paramEntries.length; i++) {
        const paramProperty = paramEntries[i]!;
        const paramValue = paramProperty.value;
        if (paramValue instanceof JsonString) fm.Params.set(paramProperty.key, ParamValue.string(paramValue.value));
        else if (paramValue instanceof JsonBool) fm.Params.set(paramProperty.key, ParamValue.bool(paramValue.value));
        else if (paramValue instanceof JsonNumber) {
          const narrowed = toInt32(paramValue.value);
          if (narrowed !== undefined) {
            fm.Params.set(paramProperty.key, ParamValue.number(narrowed));
          }
        }
      }
    } else if (key === "menu" && value instanceof JsonObject) {
      const menuItems: FrontMatterMenu[] = [];
      const menuEntries = value.properties;
      for (let i = 0; i < menuEntries.length; i++) {
        const menuProperty = menuEntries[i]!;
        const menuName = menuProperty.key;
        const menuValue = menuProperty.value;
        const entry = new FrontMatterMenu(menuName);
        if (menuValue instanceof JsonObject) {
          const entryPairs = menuValue.properties;
          for (let j = 0; j < entryPairs.length; j++) {
            const entryProperty = entryPairs[j]!;
            const entryValue = entryProperty.value;
            const entryKey = entryProperty.key.toLowerCase();
            if (entryKey === "weight" && entryValue instanceof JsonNumber) {
              const narrowed = toInt32(entryValue.value);
              if (narrowed !== undefined) {
                entry.weight = narrowed;
              }
            }
            else if (entryKey === "name" && entryValue instanceof JsonString) entry.name = entryValue.value;
            else if (entryKey === "parent" && entryValue instanceof JsonString) entry.parent = entryValue.value;
            else if (entryKey === "identifier" && entryValue instanceof JsonString) entry.identifier = entryValue.value;
            else if (entryKey === "pre" && entryValue instanceof JsonString) entry.pre = entryValue.value;
            else if (entryKey === "post" && entryValue instanceof JsonString) entry.post = entryValue.value;
            else if (entryKey === "title" && entryValue instanceof JsonString) entry.title = entryValue.value;
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
