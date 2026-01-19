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
  const v = value.Trim();
  if (v.Length >= 2 && ((v.StartsWith("\"") && v.EndsWith("\"")) || (v.StartsWith("'") && v.EndsWith("'")))) {
    return v.Substring(1, v.Length - 2);
  }
  return v;
};

const parseBool = (value: string): boolean | undefined => {
  const v = value.Trim().ToLowerInvariant();
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
};

const parseStringArrayInline = (value: string): string[] | undefined => {
  const v = value.Trim();
  if (!v.StartsWith("[") || !v.EndsWith("]")) return undefined;
  const inner = v.Substring(1, v.Length - 2).Trim();
  if (inner === "") {
    const empty: string[] = [];
    return empty;
  }
  const parts = inner.Split(",");
  const items = new List<string>();
  for (let i = 0; i < parts.Length; i++) {
    const item = unquote(parts[i]!);
    if (item !== "") items.Add(item);
  }
  return items.ToArray();
};

const applyScalar = (fm: FrontMatter, keyRaw: string, valueRaw: string): void => {
  const key = keyRaw.Trim().ToLowerInvariant();
  const value = valueRaw.Trim();

  if (key === "title") {
    fm.title = unquote(value);
    return;
  }

  if (key === "date") {
    let parsed: DateTime = DateTime.MinValue;
    const ok = DateTime.TryParse(unquote(value), parsed);
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

  const k = keyRaw.Trim();
  fm.Params.Remove(k);
  fm.Params.Add(k, ParamValue.parseScalar(unquote(value)));
};

const applyArray = (fm: FrontMatter, keyRaw: string, items: string[]): void => {
  const key = keyRaw.Trim().ToLowerInvariant();
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
  for (let i = 0; i < all.Length; i++) {
    const line = all[i]!;
    const trimmed = line.Trim();
    if (trimmed === "" || trimmed.StartsWith("#")) continue;

    if (!line.StartsWith(" ") && trimmed.Contains(":")) {
      const idx = trimmed.IndexOf(":");
      const key = trimmed.Substring(0, idx).Trim();
      const rest = trimmed.Substring(idx + 1).Trim();

      if (rest !== "") {
        applyScalar(fm, key, rest);
        continue;
      }

      const keyLower = key.ToLowerInvariant();
      if (keyLower === "params") {
        for (let j = i + 1; j < all.Length; j++) {
          const next = all[j]!;
          if (!next.StartsWith("  ")) break;
          const nt = next.Trim();
          if (nt === "" || nt.StartsWith("#")) continue;
          if (!nt.Contains(":")) continue;
          const nidx = nt.IndexOf(":");
          const pkey = nt.Substring(0, nidx).Trim();
          const pval = nt.Substring(nidx + 1).Trim();
          fm.Params.Remove(pkey);
          fm.Params.Add(pkey, ParamValue.parseScalar(unquote(pval)));
        }
        continue;
      }

      if (keyLower === "tags" || keyLower === "categories") {
        const items = new List<string>();
        for (let j = i + 1; j < all.Length; j++) {
          const next = all[j]!;
          if (!next.StartsWith("  ")) break;
          const nt = next.Trim();
          if (!nt.StartsWith("-")) continue;
          const item = nt.Substring(1).Trim();
          if (item !== "") items.Add(unquote(item));
        }
        applyArray(fm, key, items.ToArray());
        continue;
      }

      if (keyLower === "menu") {
        const menuItems = new List<FrontMatterMenu>();
        let currentMenuName = "";
        let currentMenu: FrontMatterMenu | undefined = undefined;

        for (let j = i + 1; j < all.Length; j++) {
          const next = all[j]!;
          if (!next.StartsWith("  ")) break;

          // Check for menu name line (2 spaces, not starting with more spaces)
          if (next.StartsWith("  ") && !next.StartsWith("    ")) {
            const nt = next.Trim();
            if (nt === "" || nt.StartsWith("#")) continue;
            if (nt.EndsWith(":")) {
              // New menu, e.g., "main:"
              if (currentMenu !== undefined) menuItems.Add(currentMenu);
              currentMenuName = nt.Substring(0, nt.Length - 1).Trim();
              currentMenu = new FrontMatterMenu(currentMenuName);
            } else if (nt.Contains(":")) {
              // Simple menu, e.g., "main: true" - just menu name, no config
              const colonIdx = nt.IndexOf(":");
              const menuName = nt.Substring(0, colonIdx).Trim();
              if (currentMenu !== undefined) menuItems.Add(currentMenu);
              currentMenu = new FrontMatterMenu(menuName);
              menuItems.Add(currentMenu);
              currentMenu = undefined;
            }
            continue;
          }

          // Check for menu properties (4+ spaces)
          if (currentMenu !== undefined && next.StartsWith("    ")) {
            const nt = next.Trim();
            if (nt === "" || nt.StartsWith("#")) continue;
            if (!nt.Contains(":")) continue;
            const colonIdx = nt.IndexOf(":");
            const propKey = nt.Substring(0, colonIdx).Trim().ToLowerInvariant();
            const propVal = unquote(nt.Substring(colonIdx + 1).Trim());
            if (propKey === "weight") {
              let parsed: int = 0;
              if (Int32.TryParse(propVal, parsed)) currentMenu.weight = parsed;
            } else if (propKey === "name") currentMenu.name = propVal;
            else if (propKey === "parent") currentMenu.parent = propVal;
            else if (propKey === "identifier") currentMenu.identifier = propVal;
            else if (propKey === "pre") currentMenu.pre = propVal;
            else if (propKey === "post") currentMenu.post = propVal;
            else if (propKey === "title") currentMenu.title = propVal;
          }
        }
        if (currentMenu !== undefined) menuItems.Add(currentMenu);
        fm.menus = menuItems.ToArray();
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

  for (let i = 0; i < lines.Length; i++) {
    const line = lines[i]!.Trim();
    if (line === "" || line.StartsWith("#")) continue;

    if (line.StartsWith("[[") && line.EndsWith("]]")) {
      // Array table, e.g., [[menu.main]]
      const tableName = line.Substring(2, line.Length - 4).Trim().ToLowerInvariant();
      if (tableName.StartsWith("menu.")) {
        const menuName = tableName.Substring(5).Trim();
        currentMenu = new FrontMatterMenu(menuName);
        let entries = new List<FrontMatterMenu>();
        const hasMenu = menuBuilders.TryGetValue(menuName, entries);
        if (!hasMenu) {
          entries = new List<FrontMatterMenu>();
          menuBuilders.Add(menuName, entries);
        }
        entries.Add(currentMenu);
        currentTable = tableName;
      } else {
        currentTable = tableName;
        currentMenu = undefined;
      }
      continue;
    }

    if (line.StartsWith("[") && line.EndsWith("]")) {
      currentTable = line.Substring(1, line.Length - 2).Trim().ToLowerInvariant();
      currentMenu = undefined;
      continue;
    }

    const eq = line.IndexOf("=");
    if (eq < 0) continue;

    const keyRaw = line.Substring(0, eq).Trim();
    const valueRaw = line.Substring(eq + 1).Trim();

    // Handle menu table properties
    if (currentMenu !== undefined && currentTable.StartsWith("menu.")) {
      const keyLower = keyRaw.ToLowerInvariant();
      if (keyLower === "weight") {
        let parsed: int = 0;
        if (Int32.TryParse(unquote(valueRaw), parsed)) currentMenu.weight = parsed;
      } else if (keyLower === "name") currentMenu.name = unquote(valueRaw);
      else if (keyLower === "parent") currentMenu.parent = unquote(valueRaw);
      else if (keyLower === "identifier") currentMenu.identifier = unquote(valueRaw);
      else if (keyLower === "pre") currentMenu.pre = unquote(valueRaw);
      else if (keyLower === "post") currentMenu.post = unquote(valueRaw);
      else if (keyLower === "title") currentMenu.title = unquote(valueRaw);
      continue;
    }

    if (currentTable === "params") {
      fm.Params.Remove(keyRaw);
      fm.Params.Add(keyRaw, ParamValue.parseScalar(unquote(valueRaw)));
      continue;
    }

    if (keyRaw.ToLowerInvariant() === "tags") {
      const arr = parseStringArrayInline(valueRaw);
      if (arr !== undefined) fm.tags = arr;
      continue;
    }

    if (keyRaw.ToLowerInvariant() === "categories") {
      const arr = parseStringArrayInline(valueRaw);
      if (arr !== undefined) fm.categories = arr;
      continue;
    }

    if (keyRaw.ToLowerInvariant() === "draft") {
      const b = parseBool(valueRaw);
      if (b !== undefined) fm.draft = b;
      continue;
    }

    if (keyRaw.ToLowerInvariant() === "date") {
      let parsed: DateTime = DateTime.MinValue;
      const ok = DateTime.TryParse(unquote(valueRaw), parsed);
      if (ok) fm.date = parsed;
      continue;
    }

    applyScalar(fm, keyRaw, valueRaw);
  }

  // Collect all menu entries
  const allMenus = new List<FrontMatterMenu>();
  const keysIt = menuBuilders.Keys.GetEnumerator();
  while (keysIt.MoveNext()) {
    const menuName = keysIt.Current;
    let entries = new List<FrontMatterMenu>();
    if (menuBuilders.TryGetValue(menuName, entries)) {
      const arr = entries.ToArray();
      for (let j = 0; j < arr.Length; j++) {
        allMenus.Add(arr[j]!);
      }
    }
  }
  fm.menus = allMenus.ToArray();

  return fm;
};

const parseJsonElementStringArray = (el: JsonElement): string[] | undefined => {
  if (el.ValueKind !== JsonValueKind.Array) return undefined;
  const items = new List<string>();
  const it = el.EnumerateArray().GetEnumerator();
  while (it.MoveNext()) {
    const cur = it.Current;
    if (cur.ValueKind === JsonValueKind.String) {
      const v = cur.GetString();
      if (v !== undefined) items.Add(v);
    }
  }
  return items.ToArray();
};

const parseJson = (json: string): FrontMatter => {
  const fm = new FrontMatter();
  const doc = JsonDocument.Parse(json);
  const root = doc.RootElement;

  if (root.ValueKind === JsonValueKind.Object) {
    const props = root.EnumerateObject().GetEnumerator();
    while (props.MoveNext()) {
      const p = props.Current;
      const key = p.Name.ToLowerInvariant();
      const v = p.Value;

      if (key === "title" && v.ValueKind === JsonValueKind.String) {
        fm.title = v.GetString();
        continue;
      }

      if (key === "description" && v.ValueKind === JsonValueKind.String) {
        fm.description = v.GetString();
        continue;
      }

      if (key === "slug" && v.ValueKind === JsonValueKind.String) {
        fm.slug = v.GetString();
        continue;
      }

      if (key === "layout" && v.ValueKind === JsonValueKind.String) {
        fm.layout = v.GetString();
        continue;
      }

      if (key === "type" && v.ValueKind === JsonValueKind.String) {
        fm.type = v.GetString();
        continue;
      }

      if (key === "draft" && (v.ValueKind === JsonValueKind.True || v.ValueKind === JsonValueKind.False)) {
        fm.draft = v.GetBoolean();
        continue;
      }

      if (key === "date" && v.ValueKind === JsonValueKind.String) {
        let parsed: DateTime = DateTime.MinValue;
        const ok = DateTime.TryParse(v.GetString() ?? "", parsed);
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

      if (key === "params" && v.ValueKind === JsonValueKind.Object) {
        const pp = v.EnumerateObject().GetEnumerator();
        while (pp.MoveNext()) {
          const prop = pp.Current;
          const val = prop.Value;
          if (val.ValueKind === JsonValueKind.String) {
            const s = val.GetString();
            if (s !== undefined) {
              fm.Params.Remove(prop.Name);
              fm.Params.Add(prop.Name, ParamValue.string(s));
            }
          } else if (val.ValueKind === JsonValueKind.True || val.ValueKind === JsonValueKind.False) {
            fm.Params.Remove(prop.Name);
            fm.Params.Add(prop.Name, ParamValue.bool(val.GetBoolean()));
          } else if (val.ValueKind === JsonValueKind.Number) {
            fm.Params.Remove(prop.Name);
            fm.Params.Add(prop.Name, ParamValue.number(val.GetInt32()));
          }
        }
        continue;
      }

      if (key === "menu" && v.ValueKind === JsonValueKind.Object) {
        const menuItems = new List<FrontMatterMenu>();
        const menuProps = v.EnumerateObject().GetEnumerator();
        while (menuProps.MoveNext()) {
          const menuProp = menuProps.Current;
          const menuName = menuProp.Name;
          const menuVal = menuProp.Value;

          const entry = new FrontMatterMenu(menuName);

          if (menuVal.ValueKind === JsonValueKind.Object) {
            const entryProps = menuVal.EnumerateObject().GetEnumerator();
            while (entryProps.MoveNext()) {
              const ep = entryProps.Current;
              const epKey = ep.Name.ToLowerInvariant();
              const epVal = ep.Value;
              if (epKey === "weight" && epVal.ValueKind === JsonValueKind.Number) {
                entry.weight = epVal.GetInt32();
              } else if (epKey === "name" && epVal.ValueKind === JsonValueKind.String) {
                entry.name = epVal.GetString() ?? "";
              } else if (epKey === "parent" && epVal.ValueKind === JsonValueKind.String) {
                entry.parent = epVal.GetString() ?? "";
              } else if (epKey === "identifier" && epVal.ValueKind === JsonValueKind.String) {
                entry.identifier = epVal.GetString() ?? "";
              } else if (epKey === "pre" && epVal.ValueKind === JsonValueKind.String) {
                entry.pre = epVal.GetString() ?? "";
              } else if (epKey === "post" && epVal.ValueKind === JsonValueKind.String) {
                entry.post = epVal.GetString() ?? "";
              } else if (epKey === "title" && epVal.ValueKind === JsonValueKind.String) {
                entry.title = epVal.GetString() ?? "";
              }
            }
          }
          menuItems.Add(entry);
        }
        fm.menus = menuItems.ToArray();
        continue;
      }
    }
  }

  doc.Dispose();
  return fm;
};

const tryParseJsonFrontMatter = (text: string): ParsedContent | undefined => {
  const openBrace: char = "{";
  const closeBrace: char = "}";

  const chars = text.ToCharArray();
  let start = 0;
  while (start < chars.Length && Char.IsWhiteSpace(chars[start]!)) {
    start++;
  }
  if (start >= chars.Length || chars[start]! !== openBrace) return undefined;

  let depth = 0;
  let end = -1;
  for (let i = start; i < chars.Length; i++) {
    const ch = chars[i]!;
    if (ch === openBrace) depth++;
    if (ch === closeBrace) depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end <= start) return undefined;
  const json = text.Substring(start, end - start);
  const body = text.Substring(end).TrimStart();
  return new ParsedContent(parseJson(json), body);
};

export const parseContent = (text: string): ParsedContent => {
  const json = tryParseJsonFrontMatter(text);
  if (json !== undefined) return json;

  const reader = new StringReader(text);
  const firstLine = reader.ReadLine();
  if (firstLine === undefined) return new ParsedContent(new FrontMatter(), "");

  if (firstLine.Trim() === "---") {
    const fmLines = new List<string>();
    while (true) {
      const line = reader.ReadLine();
      if (line === undefined) break;
      if (line.Trim() === "---") break;
      fmLines.Add(line);
    }
    const body = reader.ReadToEnd().TrimStart();
    return new ParsedContent(parseYaml(fmLines.ToArray()), body);
  }

  if (firstLine.Trim() === "+++") {
    const fmLines = new List<string>();
    while (true) {
      const line = reader.ReadLine();
      if (line === undefined) break;
      if (line.Trim() === "+++") break;
      fmLines.Add(line);
    }
    const body = reader.ReadToEnd().TrimStart();
    return new ParsedContent(parseToml(fmLines.ToArray()), body);
  }

  return new ParsedContent(new FrontMatter(), text);
};
