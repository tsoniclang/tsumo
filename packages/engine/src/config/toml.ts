import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { LanguageConfig, MenuEntry, ModuleMount, SiteConfig } from "../models.js";
import { buildMenuHierarchy } from "../menus.js";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.js";
import { stripStructuredComment } from "../utils/structured-scalars.js";
import { ensureTrailingSlash } from "../utils/text.js";
import { LanguageConfigBuilder, MenuEntryBuilder } from "./builders.js";
import { sortLanguages } from "./helpers.js";
import { parseConfigInt, parseConfigParam, parseConfigString } from "./scalars.js";

const splitAssignment = (line: string, sourcePath: string | undefined, lineNumber: int32): string[] => {
  const separator = line.indexOf("=");
  if (separator <= 0) {
    throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "TOML configuration entries require 'key = value' syntax", sourcePath, lineNumber, 1);
  }
  const key = substringCount(line, 0, separator).trim();
  const value = substringFrom(line, separator + 1).trim();
  if (value === "") throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Configuration field '${key}' requires a value`, sourcePath, lineNumber, 1);
  return [key, value];
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
  if (key === "name") builder.name = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "url") builder.url = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "pageref") builder.pageRef = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "title") builder.title = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "parent") builder.parent = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "identifier") builder.identifier = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "pre") builder.pre = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "post") builder.post = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "weight") builder.weight = parseConfigInt(keyRaw, value, "toml", sourcePath, line);
  else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown menu configuration field '${keyRaw}'`, sourcePath, line, 1);
};

const applyLanguageField = (
  builder: LanguageConfigBuilder,
  keyRaw: string,
  value: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "languagename") builder.languageName = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "languagedirection") builder.languageDirection = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "contentdir") builder.contentDir = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "weight") builder.weight = parseConfigInt(keyRaw, value, "toml", sourcePath, line);
  else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown language configuration field '${keyRaw}'`, sourcePath, line, 1);
};

const applyRootField = (
  config: SiteConfig,
  keyRaw: string,
  value: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "title") config.title = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "baseurl") config.baseURL = ensureTrailingSlash(parseConfigString(keyRaw, value, "toml", sourcePath, line));
  else if (key === "languagecode") config.languageCode = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "contentdir") config.contentDir = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "theme") config.theme = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else if (key === "copyright") config.copyright = parseConfigString(keyRaw, value, "toml", sourcePath, line);
  else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown configuration field '${keyRaw}'`, sourcePath, line, 1);
};

const menuBuildersToEntries = (builders: Map<string, MenuEntryBuilder[]>): Map<string, MenuEntry[]> => {
  const menus = new Map<string, MenuEntry[]>();
  for (const menuName of builders.keys()) {
    const source = builders.get(menuName);
    if (source === undefined) {
      throw createTsumoError("TSUMO_CONFIG_MODEL_INCONSISTENT", `Menu '${menuName}' disappeared during configuration finalization`);
    }
    const entries: MenuEntry[] = [];
    for (let index = 0; index < source.length; index++) entries.push(source[index]!.toEntry());
    menus.set(menuName, buildMenuHierarchy(entries));
  }
  return menus;
};

export const parseModuleToml = (text: string, sourcePath?: string): ModuleMount[] => {
  const mounts: ModuleMount[] = [];
  const lines = replaceLineEndings(text, "\n").split("\n");
  let source = "";
  let target = "";
  let inMount = false;
  let mountFields = new Set<string>();
  const finishMount = (line: int32): void => {
    if (!inMount) return;
    if (source === "" || target === "") throw createTsumoError("TSUMO_CONFIG_INVALID_MOUNT", "Every module mount requires source and target", sourcePath, line, 1);
    mounts.push(new ModuleMount(source, target));
  };

  for (let index: int32 = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = stripStructuredComment(lines[index]!, "toml").trim();
    if (line === "") continue;
    if (line === "[[mounts]]") {
      finishMount(lineNumber);
      inMount = true;
      source = "";
      target = "";
      mountFields = new Set<string>();
      continue;
    }
    if (!inMount) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "module.toml accepts only [[mounts]] entries", sourcePath, lineNumber, 1);
    const assignment = splitAssignment(line, sourcePath, lineNumber);
    recordField(mountFields, assignment[0]!, "Module mount", sourcePath, lineNumber);
    const key = assignment[0]!.toLowerCase();
    if (key === "source") source = parseConfigString(assignment[0]!, assignment[1]!, "toml", sourcePath, lineNumber);
    else if (key === "target") target = parseConfigString(assignment[0]!, assignment[1]!, "toml", sourcePath, lineNumber);
    else throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown module mount field '${assignment[0]}'`, sourcePath, lineNumber, 1);
  }
  finishMount(lines.length);
  return mounts;
};

export const parseTomlConfig = (text: string, sourcePath?: string): SiteConfig => {
  const config = new SiteConfig("Tsumo Site", "", "en-us", undefined, undefined);
  const languages = new Map<string, LanguageConfigBuilder>();
  const menuBuilders = new Map<string, MenuEntryBuilder[]>();
  const lines = replaceLineEndings(text, "\n").split("\n");
  let table = "";
  let currentMenu: MenuEntryBuilder | undefined;
  let hasLanguageCode = false;
  const rootFields = new Set<string>();
  const declaredTables = new Set<string>();
  let tableFields = new Set<string>();
  let menuFields = new Set<string>();

  for (let index: int32 = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = stripStructuredComment(lines[index]!, "toml").trim();
    if (line === "") continue;
    if (line.startsWith("[[")) {
      if (!line.endsWith("]]")) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Malformed TOML array table", sourcePath, lineNumber, 1);
      table = substringCount(line, 2, line.length - 4).trim().toLowerCase();
      if (!table.startsWith("menu.") || table.length === "menu.".length) throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Unsupported TOML array table '${table}'`, sourcePath, lineNumber, 1);
      const menuName = substringFrom(table, "menu.".length);
      currentMenu = new MenuEntryBuilder(menuName);
      menuFields = new Set<string>();
      const entries = menuBuilders.get(menuName) ?? [];
      entries.push(currentMenu);
      menuBuilders.set(menuName, entries);
      continue;
    }
    if (line.startsWith("[")) {
      if (!line.endsWith("]")) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Malformed TOML table", sourcePath, lineNumber, 1);
      table = substringCount(line, 1, line.length - 2).trim().toLowerCase();
      currentMenu = undefined;
      if (declaredTables.has(table)) throw createTsumoError("TSUMO_CONFIG_DUPLICATE_FIELD", `Configuration table '${table}' is declared more than once`, sourcePath, lineNumber, 1);
      declaredTables.add(table);
      tableFields = new Set<string>();
      if (table === "params") continue;
      if (table.startsWith("languages.") && table.length > "languages.".length) {
        const lang = substringFrom(table, "languages.".length);
        if (!languages.has(lang)) languages.set(lang, new LanguageConfigBuilder(lang));
        continue;
      }
      throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Unsupported TOML table '${table}'`, sourcePath, lineNumber, 1);
    }

    const assignment = splitAssignment(line, sourcePath, lineNumber);
    const key = assignment[0]!;
    const value = assignment[1]!;
    if (currentMenu !== undefined) {
      recordField(menuFields, key, `Menu '${currentMenu.menu}' entry`, sourcePath, lineNumber);
      applyMenuField(currentMenu, key, value, sourcePath, lineNumber);
    }
    else if (table === "params") {
      recordField(tableFields, key, "Configuration params", sourcePath, lineNumber);
      config.Params.set(key, parseConfigParam(value, "toml", sourcePath, lineNumber));
    }
    else if (table.startsWith("languages.")) {
      const lang = substringFrom(table, "languages.".length);
      const language = languages.get(lang);
      if (language === undefined) throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Unknown language table '${table}'`, sourcePath, lineNumber, 1);
      recordField(tableFields, key, `Language '${lang}'`, sourcePath, lineNumber);
      applyLanguageField(language, key, value, sourcePath, lineNumber);
    } else if (table === "") {
      recordField(rootFields, key, "Configuration", sourcePath, lineNumber);
      applyRootField(config, key, value, sourcePath, lineNumber);
      if (key.toLowerCase() === "languagecode") hasLanguageCode = true;
    }
    else throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Unsupported TOML table '${table}'`, sourcePath, lineNumber, 1);
  }

  config.Menus = menuBuildersToEntries(menuBuilders);
  config.languages = sortLanguages(Array.from(languages.values(), (language) => language.toConfig()));
  if (config.languages.length > 0) {
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  return config;
};

export const mergeTomlIntoConfig = (
  config: SiteConfig,
  text: string,
  fileName: string,
  sourcePath?: string,
): SiteConfig => {
  const lower = fileName.toLowerCase();
  if (lower === "hugo.toml" || lower === "config.toml") return parseTomlConfig(text, sourcePath);
  if (lower === "module.toml") {
    config.moduleMounts = parseModuleToml(text, sourcePath);
    return config;
  }

  const lines = replaceLineEndings(text, "\n").split("\n");
  if (lower === "params.toml") {
    let prefix = "";
    const fields = new Set<string>();
    const tables = new Set<string>();
    for (let index: int32 = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const line = stripStructuredComment(lines[index]!, "toml").trim();
      if (line === "") continue;
      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        prefix = substringCount(line, 1, line.length - 2).trim();
        const normalized = prefix.toLowerCase();
        if (tables.has(normalized)) {
          throw createTsumoError("TSUMO_CONFIG_DUPLICATE_FIELD", `Configuration params table '${prefix}' is declared more than once`, sourcePath, lineNumber, 1);
        }
        tables.add(normalized);
        if (prefix !== "") prefix += ".";
        continue;
      }
      const assignment = splitAssignment(line, sourcePath, lineNumber);
      const key = prefix + assignment[0]!;
      recordField(fields, key, "Configuration params", sourcePath, lineNumber);
      config.Params.set(key, parseConfigParam(assignment[1]!, "toml", sourcePath, lineNumber));
    }
    return config;
  }

  if (lower === "languages.toml" || (lower.startsWith("languages.") && lower.endsWith(".toml"))) {
    const aggregate = lower === "languages.toml";
    const existing = new Map<string, LanguageConfig>();
    for (let index = 0; index < config.languages.length; index++) {
      existing.set(config.languages[index]!.lang.toLowerCase(), config.languages[index]!);
    }
    const builders = new Map<string, LanguageConfigBuilder>();
    const fields = new Map<string, Set<string>>();
    const tables = new Set<string>();
    let current = "";
    if (!aggregate) current = substringCount(lower, "languages.".length, lower.length - "languages.".length - ".toml".length);
    for (let index: int32 = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const line = stripStructuredComment(lines[index]!, "toml").trim();
      if (line === "") continue;
      if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[[")) {
        if (!aggregate) {
          throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Language file '${fileName}' accepts fields only for '${current}'`, sourcePath, lineNumber, 1);
        }
        current = substringCount(line, 1, line.length - 2).trim().toLowerCase();
        if (current === "" || current.includes(".")) throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Unsupported language table '${current}'`, sourcePath, lineNumber, 1);
        if (tables.has(current)) throw createTsumoError("TSUMO_CONFIG_DUPLICATE_FIELD", `Language table '${current}' is declared more than once`, sourcePath, lineNumber, 1);
        tables.add(current);
        continue;
      }
      if (current === "") throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", "Language configuration requires a language identity", sourcePath, lineNumber, 1);
      let builder = builders.get(current);
      if (builder === undefined) {
        builder = new LanguageConfigBuilder(current, existing.get(current));
        builders.set(current, builder);
        fields.set(current, new Set<string>());
      }
      const assignment = splitAssignment(line, sourcePath, lineNumber);
      const languageFields = fields.get(current);
      if (languageFields === undefined) throw createTsumoError("TSUMO_CONFIG_MODEL_INCONSISTENT", `Language '${current}' fields disappeared during configuration merge`, sourcePath);
      recordField(languageFields, assignment[0]!, `Language '${current}'`, sourcePath, lineNumber);
      applyLanguageField(builder, assignment[0]!, assignment[1]!, sourcePath, lineNumber);
    }
    for (const key of builders.keys()) {
      const builder = builders.get(key);
      if (builder === undefined) throw createTsumoError("TSUMO_CONFIG_MODEL_INCONSISTENT", `Language '${key}' disappeared during configuration merge`, sourcePath);
      existing.set(key, builder.toConfig());
    }
    config.languages = sortLanguages(Array.from(existing.values()));
    if (config.languages.length > 0) {
      config.contentDir = config.languages[0]!.contentDir;
      config.languageCode = config.languages[0]!.lang;
    }
    return config;
  }

  if (lower.startsWith("menus.") && lower.endsWith(".toml")) {
    const menuName = substringCount(lower, "menus.".length, lower.length - "menus.".length - ".toml".length);
    if (menuName === "") throw createTsumoError("TSUMO_CONFIG_FILE_UNSUPPORTED", `Unsupported split configuration file '${fileName}'`, sourcePath);
    const builders: MenuEntryBuilder[] = [];
    let current: MenuEntryBuilder | undefined;
    let fields = new Set<string>();
    for (let index: int32 = 0; index < lines.length; index++) {
      const lineNumber = index + 1;
      const line = stripStructuredComment(lines[index]!, "toml").trim();
      if (line === "") continue;
      if (line.startsWith("[[") && line.endsWith("]]")) {
        const table = substringCount(line, 2, line.length - 4).trim().toLowerCase();
        if (table !== menuName) throw createTsumoError("TSUMO_CONFIG_TABLE_UNSUPPORTED", `Menu file '${fileName}' cannot declare '${table}'`, sourcePath, lineNumber, 1);
        current = new MenuEntryBuilder(menuName);
        fields = new Set<string>();
        builders.push(current);
        continue;
      }
      if (current === undefined) throw createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", `Menu file '${fileName}' requires [[${menuName}]] entries`, sourcePath, lineNumber, 1);
      const assignment = splitAssignment(line, sourcePath, lineNumber);
      recordField(fields, assignment[0]!, `Menu '${menuName}' entry`, sourcePath, lineNumber);
      applyMenuField(current, assignment[0]!, assignment[1]!, sourcePath, lineNumber);
    }
    const entries: MenuEntry[] = [];
    for (let index = 0; index < builders.length; index++) entries.push(builders[index]!.toEntry());
    config.Menus.set(menuName, buildMenuHierarchy(entries));
    return config;
  }

  throw createTsumoError("TSUMO_CONFIG_FILE_UNSUPPORTED", `Unsupported split configuration file '${fileName}'`, sourcePath);
};
