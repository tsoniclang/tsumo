import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { MenuEntry, SiteConfig } from "../models.js";
import { buildMenuHierarchy } from "../menus.js";
import { ParamValue } from "../params.js";
import { substringCount, substringFrom } from "../utils/strings.js";
import { stripStructuredComment } from "../utils/structured-scalars.js";
import { ensureTrailingSlash } from "../utils/text.js";
import { MenuEntryBuilder } from "./builders.js";
import { parseConfigInt, parseConfigParam, parseConfigString } from "./scalars.js";

const indentationOf = (line: string): int32 => {
  let indentation: int32 = 0;
  while (indentation < line.length && line[indentation] === " ") indentation++;
  return indentation;
};

const yamlText = (line: string): string => stripStructuredComment(line, "yaml").trim();

const splitPair = (text: string, sourcePath: string | undefined, line: int32): string[] => {
  const separator = text.indexOf(":");
  if (separator <= 0) {
    throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "YAML configuration entries require 'key: value' syntax", sourcePath, line, 1);
  }
  return [substringCount(text, 0, separator).trim(), substringFrom(text, separator + 1).trim()];
};

const recordField = (
  fields: Set<string>,
  field: string,
  context: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const normalized = field.toLowerCase();
  if (fields.has(normalized)) {
    throw createTsumoError("TSUMO_CONFIG_DUPLICATE_FIELD", `${context} field '${field}' is declared more than once`, sourcePath, line, 1);
  }
  fields.add(normalized);
};

const applyMenuField = (
  builder: MenuEntryBuilder,
  keyRaw: string,
  value: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "name") builder.name = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "url") builder.url = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "pageref") builder.pageRef = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "title") builder.title = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "parent") builder.parent = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "identifier") builder.identifier = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "pre") builder.pre = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "post") builder.post = parseConfigString(keyRaw, value, "yaml", sourcePath, line);
  else if (key === "weight") builder.weight = parseConfigInt(keyRaw, value, "yaml", sourcePath, line);
  else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown menu configuration field '${keyRaw}'`, sourcePath, line, 1);
};

export const parseYamlConfig = (text: string, sourcePath?: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined;
  let copyright: string | undefined;
  const params = new Map<string, ParamValue>();
  const menuBuilders = new Map<string, MenuEntryBuilder[]>();
  const rootFields = new Set<string>();
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");

  let index: int32 = 0;
  while (index < lines.length) {
    const raw = lines[index]!;
    const lineNumber = index + 1;
    if (raw.includes("\t")) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "YAML configuration indentation must use spaces", sourcePath, lineNumber, 1);
    const textValue = yamlText(raw);
    if (textValue === "" || textValue.startsWith("#")) {
      index++;
      continue;
    }
    if (indentationOf(raw) !== 0) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "YAML configuration has an unexpected indented entry", sourcePath, lineNumber, 1);
    const pair = splitPair(textValue, sourcePath, lineNumber);
    const keyRaw = pair[0]!;
    const key = keyRaw.toLowerCase();
    const value = pair[1]!;
    recordField(rootFields, keyRaw, "Configuration", sourcePath, lineNumber);
    if (value !== "") {
      if (key === "title") title = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else if (key === "baseurl") baseURL = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else if (key === "languagecode") languageCode = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else if (key === "contentdir") contentDir = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else if (key === "theme") theme = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else if (key === "copyright") copyright = parseConfigString(keyRaw, value, "yaml", sourcePath, lineNumber);
      else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown configuration field '${keyRaw}'`, sourcePath, lineNumber, 1);
      index++;
      continue;
    }

    index++;
    if (key === "params") {
      const paramFields = new Set<string>();
      while (index < lines.length && indentationOf(lines[index]!) > 0) {
        const childRaw = lines[index]!;
        const childLine = index + 1;
        const childText = yamlText(childRaw);
        if (childText !== "" && !childText.startsWith("#")) {
          if (indentationOf(childRaw) !== 2) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Configuration params require one scalar mapping level", sourcePath, childLine, 1);
          const child = splitPair(childText, sourcePath, childLine);
          if (child[1] === "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Configuration param '${child[0]}' requires a scalar value`, sourcePath, childLine, 1);
          recordField(paramFields, child[0]!, "Configuration params", sourcePath, childLine);
          params.set(child[0]!, parseConfigParam(child[1]!, "yaml", sourcePath, childLine));
        }
        index++;
      }
      continue;
    }

    if (key === "menu") {
      const menuNames = new Set<string>();
      while (index < lines.length && indentationOf(lines[index]!) > 0) {
        const menuRaw = lines[index]!;
        const menuLine = index + 1;
        const menuText = yamlText(menuRaw);
        if (menuText === "" || menuText.startsWith("#")) {
          index++;
          continue;
        }
        if (indentationOf(menuRaw) !== 2) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Menu names require one mapping level", sourcePath, menuLine, 1);
        const menuPair = splitPair(menuText, sourcePath, menuLine);
        if (menuPair[1] !== "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Menu '${menuPair[0]}' requires an array of entries`, sourcePath, menuLine, 1);
        const menuName = menuPair[0]!;
        recordField(menuNames, menuName, "Configuration menu", sourcePath, menuLine);
        const entries = menuBuilders.get(menuName) ?? [];
        index++;
        while (index < lines.length && indentationOf(lines[index]!) > 2) {
          const entryRaw = lines[index]!;
          const entryLine = index + 1;
          const entryText = yamlText(entryRaw);
          if (entryText === "" || entryText.startsWith("#")) {
            index++;
            continue;
          }
          if (indentationOf(entryRaw) !== 4 || !entryText.startsWith("-")) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", `Menu '${menuName}' requires '- field: value' entries`, sourcePath, entryLine, 1);
          const builder = new MenuEntryBuilder(menuName);
          const first = splitPair(substringFrom(entryText, 1).trim(), sourcePath, entryLine);
          if (first[1] === "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Menu field '${first[0]}' requires a value`, sourcePath, entryLine, 1);
          const entryFields = new Set<string>();
          recordField(entryFields, first[0]!, `Menu '${menuName}' entry`, sourcePath, entryLine);
          applyMenuField(builder, first[0]!, first[1]!, sourcePath, entryLine);
          index++;
          while (index < lines.length && indentationOf(lines[index]!) > 4) {
            const fieldRaw = lines[index]!;
            const fieldLine = index + 1;
            const fieldText = yamlText(fieldRaw);
            if (fieldText !== "" && !fieldText.startsWith("#")) {
              if (indentationOf(fieldRaw) !== 6) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Menu entry fields require three mapping levels", sourcePath, fieldLine, 1);
              const field = splitPair(fieldText, sourcePath, fieldLine);
              if (field[1] === "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Menu field '${field[0]}' requires a value`, sourcePath, fieldLine, 1);
              recordField(entryFields, field[0]!, `Menu '${menuName}' entry`, sourcePath, fieldLine);
              applyMenuField(builder, field[0]!, field[1]!, sourcePath, fieldLine);
            }
            index++;
          }
          entries.push(builder);
        }
        menuBuilders.set(menuName, entries);
      }
      continue;
    }
    throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown nested configuration field '${keyRaw}'`, sourcePath, lineNumber, 1);
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  config.Params = params;
  for (const menuName of menuBuilders.keys()) {
    const builders = menuBuilders.get(menuName);
    if (builders === undefined) {
      throw createTsumoError("TSUMO_CONFIG_MODEL_INCONSISTENT", `Menu '${menuName}' disappeared during configuration finalization`, sourcePath);
    }
    const entries: MenuEntry[] = [];
    for (let index = 0; index < builders.length; index++) entries.push(builders[index]!.toEntry());
    config.Menus.set(menuName, buildMenuHierarchy(entries));
  }
  return config;
};

export const mergeYamlIntoConfig = (
  config: SiteConfig,
  text: string,
  fileName: string,
  sourcePath?: string,
): SiteConfig => {
  const lower = fileName.toLowerCase();
  if (lower === "hugo.yaml" || lower === "hugo.yml" || lower === "config.yaml" || lower === "config.yml") {
    return parseYamlConfig(text, sourcePath);
  }
  if (lower === "params.yaml" || lower === "params.yml") {
    const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    const fields = new Set<string>();
    for (let index: int32 = 0; index < lines.length; index++) {
      const raw = lines[index]!;
      const value = yamlText(raw);
      if (value === "" || value.startsWith("#")) continue;
      if (indentationOf(raw) !== 0) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Split params configuration requires a flat scalar mapping", sourcePath, index + 1, 1);
      const pair = splitPair(value, sourcePath, index + 1);
      if (pair[1] === "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Configuration param '${pair[0]}' requires a scalar value`, sourcePath, index + 1, 1);
      recordField(fields, pair[0]!, "Configuration params", sourcePath, index + 1);
      config.Params.set(pair[0]!, parseConfigParam(pair[1]!, "yaml", sourcePath, index + 1));
    }
    return config;
  }
  throw createTsumoError("TSUMO_CONFIG_FILE_UNSUPPORTED", `Unsupported split configuration file '${fileName}'`, sourcePath);
};
