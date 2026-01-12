import { Char, DateTime, Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringReader } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonElement, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { char, int } from "@tsonic/core/types.js";
import { ParamValue } from "../params.ts";
import { FrontMatterMenu } from "./menu.ts";
import { FrontMatter } from "./data.ts";
import { ParsedContent } from "./parsed-content.ts";

const unquote = (value: string): string => {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.substring(1, v.length - 2);
  }
  return v;
};

const parseBool = (value: string): boolean | undefined => {
  const v = value.trim().toLowerInvariant();
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
};

const parseStringArrayInline = (value: string): string[] | undefined => {
  const v = value.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) return undefined;
  const inner = v.substring(1, v.length - 2).trim();
  if (inner === "") {
    const empty: string[] = [];
    return empty;
  }
  const parts = inner.split(",");
  const items = new List<string>();
  for (let i = 0; i < parts.length; i++) {
    const item = unquote(parts[i]!);
    if (item !== "") items.add(item);
  }
  return items.toArray();
};

const applyScalar = (fm: FrontMatter, keyRaw: string, valueRaw: string): void => {
  const key = keyRaw.trim().toLowerInvariant();
  const value = valueRaw.trim();

  if (key === "title") {
    fm.title = unquote(value);
    return;
  }

  if (key === "date") {
    const parsed: DateTime = DateTime.minValue;
    const ok = DateTime.tryParse(unquote(value), parsed);
    if (ok) fm.date = parsed;
    return;
  }

  if (key === "draft") {
    const b = parseBool(value);
    if (b !== undefined) fm.draft = b;
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
    const arr = parseStringArrayInline(value);
    if (arr !== undefined) fm.tags = arr;
    return;
  }

  if (key === "categories") {
    const arr = parseStringArrayInline(value);
    if (arr !== undefined) fm.categories = arr;
    return;
  }

  const k = keyRaw.trim();
  fm.Params.remove(k);
  fm.Params.add(k, ParamValue.parseScalar(unquote(value)));
};

const applyArray = (fm: FrontMatter, keyRaw: string, items: string[]): void => {
  const key = keyRaw.trim().toLowerInvariant();
  if (key === "tags") {
    fm.tags = items;
    return;
  }
  if (key === "categories") {
    fm.categories = items;
    return;
  }
};

const parseYaml = (all: string[]): FrontMatter => {
  const fm = new FrontMatter();
  for (let i = 0; i < all.length; i++) {
    const line = all[i]!;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (!line.startsWith(" ") && trimmed.contains(":")) {
      const idx = trimmed.indexOf(":");
      const key = trimmed.substring(0, idx).trim();
      const rest = trimmed.substring(idx + 1).trim();

      if (rest !== "") {
        applyScalar(fm, key, rest);
        continue;
      }

      const keyLower = key.toLowerInvariant();
      if (keyLower === "params") {
        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;
          const nt = next.trim();
          if (nt === "" || nt.startsWith("#")) continue;
          if (!nt.contains(":")) continue;
          const nidx = nt.indexOf(":");
          const pkey = nt.substring(0, nidx).trim();
          const pval = nt.substring(nidx + 1).trim();
          fm.Params.remove(pkey);
          fm.Params.add(pkey, ParamValue.parseScalar(unquote(pval)));
        }
        continue;
      }

      if (keyLower === "tags" || keyLower === "categories") {
        const items = new List<string>();
        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;
          const nt = next.trim();
          if (!nt.startsWith("-")) continue;
          const item = nt.substring(1).trim();
          if (item !== "") items.add(unquote(item));
        }
        applyArray(fm, key, items.toArray());
        continue;
      }

      if (keyLower === "menu") {
        const menuItems = new List<FrontMatterMenu>();
        let currentMenuName = "";
        let currentMenu: FrontMatterMenu | undefined = undefined;

        for (let j = i + 1; j < all.length; j++) {
          const next = all[j]!;
          if (!next.startsWith("  ")) break;

          // Check for menu name line (2 spaces, not starting with more spaces)
          if (next.startsWith("  ") && !next.startsWith("    ")) {
            const nt = next.trim();
            if (nt === "" || nt.startsWith("#")) continue;
            if (nt.endsWith(":")) {
              // New menu, e.g., "main:"
              if (currentMenu !== undefined) menuItems.add(currentMenu);
              currentMenuName = nt.substring(0, nt.length - 1).trim();
              currentMenu = new FrontMatterMenu(currentMenuName);
            } else if (nt.contains(":")) {
              // Simple menu, e.g., "main: true" - just menu name, no config
              const colonIdx = nt.indexOf(":");
              const menuName = nt.substring(0, colonIdx).trim();
              if (currentMenu !== undefined) menuItems.add(currentMenu);
              currentMenu = new FrontMatterMenu(menuName);
              menuItems.add(currentMenu);
              currentMenu = undefined;
            }
            continue;
          }

          // Check for menu properties (4+ spaces)
          if (currentMenu !== undefined && next.startsWith("    ")) {
            const nt = next.trim();
            if (nt === "" || nt.startsWith("#")) continue;
            if (!nt.contains(":")) continue;
            const colonIdx = nt.indexOf(":");
            const propKey = nt.substring(0, colonIdx).trim().toLowerInvariant();
            const propVal = unquote(nt.substring(colonIdx + 1).trim());
            if (propKey === "weight") {
              const parsed: int = 0;
              if (Int32.tryParse(propVal, parsed)) currentMenu.weight = parsed;
            } else if (propKey === "name") currentMenu.name = propVal;
            else if (propKey === "parent") currentMenu.parent = propVal;
            else if (propKey === "identifier") currentMenu.identifier = propVal;
            else if (propKey === "pre") currentMenu.pre = propVal;
            else if (propKey === "post") currentMenu.post = propVal;
            else if (propKey === "title") currentMenu.title = propVal;
          }
        }
        if (currentMenu !== undefined) menuItems.add(currentMenu);
        fm.menus = menuItems.toArray();
      }
    }
  }

  return fm;
};

const parseToml = (lines: string[]): FrontMatter => {
  const fm = new FrontMatter();
  let currentTable = "";
  const menuBuilders = new Dictionary<string, List<FrontMatterMenu>>();
  let currentMenu: FrontMatterMenu | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      // Array table, e.g., [[menu.main]]
      const tableName = line.substring(2, line.length - 4).trim().toLowerInvariant();
      if (tableName.startsWith("menu.")) {
        const menuName = tableName.substring(5).trim();
        currentMenu = new FrontMatterMenu(menuName);
        let entries = new List<FrontMatterMenu>();
        const hasMenu = menuBuilders.tryGetValue(menuName, entries);
        if (!hasMenu) {
          entries = new List<FrontMatterMenu>();
          menuBuilders.add(menuName, entries);
        }
        entries.add(currentMenu);
        currentTable = tableName;
      } else {
        currentTable = tableName;
        currentMenu = undefined;
      }
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentTable = line.substring(1, line.length - 2).trim().toLowerInvariant();
      currentMenu = undefined;
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const keyRaw = line.substring(0, eq).trim();
    const valueRaw = line.substring(eq + 1).trim();

    // Handle menu table properties
    if (currentMenu !== undefined && currentTable.startsWith("menu.")) {
      const keyLower = keyRaw.toLowerInvariant();
      if (keyLower === "weight") {
        const parsed: int = 0;
        if (Int32.tryParse(unquote(valueRaw), parsed)) currentMenu.weight = parsed;
      } else if (keyLower === "name") currentMenu.name = unquote(valueRaw);
      else if (keyLower === "parent") currentMenu.parent = unquote(valueRaw);
      else if (keyLower === "identifier") currentMenu.identifier = unquote(valueRaw);
      else if (keyLower === "pre") currentMenu.pre = unquote(valueRaw);
      else if (keyLower === "post") currentMenu.post = unquote(valueRaw);
      else if (keyLower === "title") currentMenu.title = unquote(valueRaw);
      continue;
    }

    if (currentTable === "params") {
      fm.Params.remove(keyRaw);
      fm.Params.add(keyRaw, ParamValue.parseScalar(unquote(valueRaw)));
      continue;
    }

    if (keyRaw.toLowerInvariant() === "tags") {
      const arr = parseStringArrayInline(valueRaw);
      if (arr !== undefined) fm.tags = arr;
      continue;
    }

    if (keyRaw.toLowerInvariant() === "categories") {
      const arr = parseStringArrayInline(valueRaw);
      if (arr !== undefined) fm.categories = arr;
      continue;
    }

    if (keyRaw.toLowerInvariant() === "draft") {
      const b = parseBool(valueRaw);
      if (b !== undefined) fm.draft = b;
      continue;
    }

    if (keyRaw.toLowerInvariant() === "date") {
      const parsed: DateTime = DateTime.minValue;
      const ok = DateTime.tryParse(unquote(valueRaw), parsed);
      if (ok) fm.date = parsed;
      continue;
    }

    applyScalar(fm, keyRaw, valueRaw);
  }

  // Collect all menu entries
  const allMenus = new List<FrontMatterMenu>();
  const keysIt = menuBuilders.keys.getEnumerator();
  while (keysIt.moveNext()) {
    const menuName = keysIt.current;
    const entries = new List<FrontMatterMenu>();
    if (menuBuilders.tryGetValue(menuName, entries)) {
      const arr = entries.toArray();
      for (let j = 0; j < arr.length; j++) {
        allMenus.add(arr[j]!);
      }
    }
  }
  fm.menus = allMenus.toArray();

  return fm;
};

const parseJsonElementStringArray = (el: JsonElement): string[] | undefined => {
  if (el.valueKind !== JsonValueKind.array) return undefined;
  const items = new List<string>();
  const it = el.enumerateArray().getEnumerator();
  while (it.moveNext()) {
    const cur = it.current;
    if (cur.valueKind === JsonValueKind.string_) {
      const v = cur.getString();
      if (v !== undefined) items.add(v);
    }
  }
  return items.toArray();
};

const parseJson = (json: string): FrontMatter => {
  const fm = new FrontMatter();
  const doc = JsonDocument.parse(json);
  const root = doc.rootElement;

  if (root.valueKind === JsonValueKind.object_) {
    const props = root.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      const key = p.name.toLowerInvariant();
      const v = p.value;

      if (key === "title" && v.valueKind === JsonValueKind.string_) {
        fm.title = v.getString();
        continue;
      }

      if (key === "description" && v.valueKind === JsonValueKind.string_) {
        fm.description = v.getString();
        continue;
      }

      if (key === "slug" && v.valueKind === JsonValueKind.string_) {
        fm.slug = v.getString();
        continue;
      }

      if (key === "layout" && v.valueKind === JsonValueKind.string_) {
        fm.layout = v.getString();
        continue;
      }

      if (key === "type" && v.valueKind === JsonValueKind.string_) {
        fm.type = v.getString();
        continue;
      }

      if (key === "draft" && (v.valueKind === JsonValueKind.true_ || v.valueKind === JsonValueKind.false_)) {
        fm.draft = v.getBoolean();
        continue;
      }

      if (key === "date" && v.valueKind === JsonValueKind.string_) {
        const parsed: DateTime = DateTime.minValue;
        const ok = DateTime.tryParse(v.getString() ?? "", parsed);
        if (ok) fm.date = parsed;
        continue;
      }

      if (key === "tags") {
        const arr = parseJsonElementStringArray(v);
        if (arr !== undefined) fm.tags = arr;
        continue;
      }

      if (key === "categories") {
        const arr = parseJsonElementStringArray(v);
        if (arr !== undefined) fm.categories = arr;
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
              fm.Params.remove(prop.name);
              fm.Params.add(prop.name, ParamValue.string(s));
            }
          } else if (val.valueKind === JsonValueKind.true_ || val.valueKind === JsonValueKind.false_) {
            fm.Params.remove(prop.name);
            fm.Params.add(prop.name, ParamValue.bool(val.getBoolean()));
          } else if (val.valueKind === JsonValueKind.number_) {
            fm.Params.remove(prop.name);
            fm.Params.add(prop.name, ParamValue.number(val.getInt32()));
          }
        }
        continue;
      }

      if (key === "menu" && v.valueKind === JsonValueKind.object_) {
        const menuItems = new List<FrontMatterMenu>();
        const menuProps = v.enumerateObject().getEnumerator();
        while (menuProps.moveNext()) {
          const menuProp = menuProps.current;
          const menuName = menuProp.name;
          const menuVal = menuProp.value;

          const entry = new FrontMatterMenu(menuName);

          if (menuVal.valueKind === JsonValueKind.object_) {
            const entryProps = menuVal.enumerateObject().getEnumerator();
            while (entryProps.moveNext()) {
              const ep = entryProps.current;
              const epKey = ep.name.toLowerInvariant();
              const epVal = ep.value;
              if (epKey === "weight" && epVal.valueKind === JsonValueKind.number_) {
                entry.weight = epVal.getInt32();
              } else if (epKey === "name" && epVal.valueKind === JsonValueKind.string_) {
                entry.name = epVal.getString() ?? "";
              } else if (epKey === "parent" && epVal.valueKind === JsonValueKind.string_) {
                entry.parent = epVal.getString() ?? "";
              } else if (epKey === "identifier" && epVal.valueKind === JsonValueKind.string_) {
                entry.identifier = epVal.getString() ?? "";
              } else if (epKey === "pre" && epVal.valueKind === JsonValueKind.string_) {
                entry.pre = epVal.getString() ?? "";
              } else if (epKey === "post" && epVal.valueKind === JsonValueKind.string_) {
                entry.post = epVal.getString() ?? "";
              } else if (epKey === "title" && epVal.valueKind === JsonValueKind.string_) {
                entry.title = epVal.getString() ?? "";
              }
            }
          }
          menuItems.add(entry);
        }
        fm.menus = menuItems.toArray();
        continue;
      }
    }
  }

  doc.dispose();
  return fm;
};

const tryParseJsonFrontMatter = (text: string): ParsedContent | undefined => {
  const openBrace: char = "{";
  const closeBrace: char = "}";

  const chars = text.toCharArray();
  let start = 0;
  while (start < chars.length && Char.isWhiteSpace(chars[start]!)) {
    start++;
  }
  if (start >= chars.length || chars[start]! !== openBrace) return undefined;

  let depth = 0;
  let end = -1;
  for (let i = start; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === openBrace) depth++;
    if (ch === closeBrace) depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end <= start) return undefined;
  const json = text.substring(start, end - start);
  const body = text.substring(end).trimStart();
  return new ParsedContent(parseJson(json), body);
};

export const parseContent = (text: string): ParsedContent => {
  const json = tryParseJsonFrontMatter(text);
  if (json !== undefined) return json;

  const reader = new StringReader(text);
  const firstLine = reader.readLine();
  if (firstLine === undefined) return new ParsedContent(new FrontMatter(), "");

  if (firstLine.trim() === "---") {
    const fmLines = new List<string>();
    while (true) {
      const line = reader.readLine();
      if (line === undefined) break;
      if (line.trim() === "---") break;
      fmLines.add(line);
    }
    const body = reader.readToEnd().trimStart();
    return new ParsedContent(parseYaml(fmLines.toArray()), body);
  }

  if (firstLine.trim() === "+++") {
    const fmLines = new List<string>();
    while (true) {
      const line = reader.readLine();
      if (line === undefined) break;
      if (line.trim() === "+++") break;
      fmLines.add(line);
    }
    const body = reader.readToEnd().trimStart();
    return new ParsedContent(parseToml(fmLines.toArray()), body);
  }

  return new ParsedContent(new FrontMatter(), text);
};
