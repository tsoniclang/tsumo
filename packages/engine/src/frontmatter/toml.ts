import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { substringCount, substringFrom } from "../utils/strings.js";
import { stripStructuredComment } from "../utils/structured-scalars.js";
import { FrontMatter } from "./data.js";
import { FrontMatterMenu } from "./menu.js";
import {
  applyFrontMatterScalar,
  parseFrontMatterInt,
  parseFrontMatterParam,
  parseFrontMatterString,
  recordFrontMatterField,
} from "./scalars.js";

const applyMenuProperty = (
  entry: FrontMatterMenu,
  keyRaw: string,
  valueRaw: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "weight") entry.weight = parseFrontMatterInt(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "name") entry.name = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "parent") entry.parent = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "identifier") entry.identifier = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "pre") entry.pre = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "post") entry.post = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else if (key === "title") entry.title = parseFrontMatterString(valueRaw, keyRaw, "toml", sourcePath, line);
  else {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_MENU_FIELD_UNKNOWN",
      `Unknown front matter menu field '${keyRaw}'`,
      sourcePath,
      line,
      1,
    );
  }
};

export const parseTomlFrontMatter = (lines: string[], sourcePath?: string): FrontMatter => {
  const frontMatter = new FrontMatter();
  let table = "";
  let menuEntry: FrontMatterMenu | undefined;
  const rootFields = new Set<string>();
  const declaredTables = new Set<string>();
  const menuNames = new Set<string>();
  let tableFields = new Set<string>();
  let menuFields = new Set<string>();

  for (let index: int32 = 0; index < lines.length; index++) {
    const lineNumber = index + 2;
    const line = stripStructuredComment(lines[index]!, "toml").trim();
    if (line === "") continue;

    if (line.startsWith("[[")) {
      if (!line.endsWith("]]")) {
        throw createTsumoError("TSUMO_FRONTMATTER_TOML_SYNTAX_INVALID", "Malformed TOML array table", sourcePath, lineNumber, 1);
      }
      table = substringCount(line, 2, line.length - 4).trim().toLowerCase();
      if (!table.startsWith("menu.") || table.length === "menu.".length) {
        throw createTsumoError("TSUMO_FRONTMATTER_TOML_TABLE_UNSUPPORTED", `Unsupported front matter TOML array table '${table}'`, sourcePath, lineNumber, 1);
      }
      recordFrontMatterField(menuNames, substringFrom(table, "menu.".length), "Front matter menu", sourcePath, lineNumber);
      menuEntry = new FrontMatterMenu(substringFrom(table, "menu.".length));
      menuFields = new Set<string>();
      frontMatter.menus.push(menuEntry);
      continue;
    }

    if (line.startsWith("[")) {
      if (!line.endsWith("]")) {
        throw createTsumoError("TSUMO_FRONTMATTER_TOML_SYNTAX_INVALID", "Malformed TOML table", sourcePath, lineNumber, 1);
      }
      table = substringCount(line, 1, line.length - 2).trim().toLowerCase();
      if (table !== "params") {
        throw createTsumoError("TSUMO_FRONTMATTER_TOML_TABLE_UNSUPPORTED", `Unsupported front matter TOML table '${table}'`, sourcePath, lineNumber, 1);
      }
      if (declaredTables.has(table)) {
        throw createTsumoError("TSUMO_FRONTMATTER_FIELD_DUPLICATE", `Front matter table '${table}' is declared more than once`, sourcePath, lineNumber, 1);
      }
      declaredTables.add(table);
      tableFields = new Set<string>();
      menuEntry = undefined;
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_TOML_SYNTAX_INVALID",
        "TOML front matter entries require 'key = value' syntax",
        sourcePath,
        lineNumber,
        1,
      );
    }
    const key = substringCount(line, 0, separator).trim();
    const value = substringFrom(line, separator + 1).trim();
    if (value === "") {
      throw createTsumoError("TSUMO_FRONTMATTER_TOML_SYNTAX_INVALID", `Front matter field '${key}' requires a value`, sourcePath, lineNumber, 1);
    }

    if (menuEntry !== undefined && table.startsWith("menu.")) {
      recordFrontMatterField(menuFields, key, `Front matter menu '${menuEntry.menu}'`, sourcePath, lineNumber);
      applyMenuProperty(menuEntry, key, value, sourcePath, lineNumber);
    } else if (table === "params") {
      recordFrontMatterField(tableFields, key, "Front matter params", sourcePath, lineNumber);
      frontMatter.Params.set(key, parseFrontMatterParam(value, "toml", sourcePath, lineNumber));
    } else if (table === "") {
      recordFrontMatterField(rootFields, key, "Front matter", sourcePath, lineNumber);
      applyFrontMatterScalar(frontMatter, key, value, "toml", sourcePath, lineNumber);
    } else {
      throw createTsumoError("TSUMO_FRONTMATTER_TOML_TABLE_UNSUPPORTED", `Unsupported front matter TOML table '${table}'`, sourcePath, lineNumber, 1);
    }
  }
  return frontMatter;
};
