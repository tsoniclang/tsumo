import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError, TsumoError } from "../diagnostics.js";
import { LanguageConfig, MenuEntry, SiteConfig } from "../models.js";
import { buildMenuHierarchy } from "../menus.js";
import { ParamValue } from "../params.js";
import { toInt32 } from "../utils/int32.js";
import {
  JsonArray,
  JsonBool,
  JsonNumber,
  JsonObject,
  JsonString,
  JsonValue,
  parseJson,
} from "../utils/json.js";
import { ensureTrailingSlash } from "../utils/text.js";
import { LanguageConfigBuilder, MenuEntryBuilder } from "./builders.js";
import { sortLanguages } from "./helpers.js";

function invalidField(field: string, expected: string, value: JsonValue, sourcePath?: string): TsumoError {
  return createTsumoError(
    "TSUMO_CONFIG_INVALID_FIELD",
    `Configuration field '${field}' requires ${expected}`,
    sourcePath,
    value.line,
    value.column,
  );
}

const requireString = (field: string, value: JsonValue, sourcePath?: string): string => {
  if (value instanceof JsonString) return value.value;
  throw invalidField(field, "a string", value, sourcePath);
};

const requireInt = (field: string, value: JsonValue, sourcePath?: string): int32 => {
  if (value instanceof JsonNumber) {
    const narrowed = toInt32(value.value);
    if (narrowed !== undefined) return narrowed;
  }
  throw invalidField(field, "a 32-bit integer", value, sourcePath);
};

const requireObject = (field: string, value: JsonValue, sourcePath?: string): JsonObject => {
  if (value instanceof JsonObject) return value as JsonObject;
  throw invalidField(field, "an object", value, sourcePath);
};

const requireArray = (field: string, value: JsonValue, sourcePath?: string): JsonArray => {
  if (value instanceof JsonArray) return value as JsonArray;
  throw invalidField(field, "an array", value, sourcePath);
};

const assertUniqueFields = (object: JsonObject, context: string, sourcePath?: string): void => {
  const names = new Set<string>();
  for (let index = 0; index < object.properties.length; index++) {
    const property = object.properties[index]!;
    const name = property.key.toLowerCase();
    if (names.has(name)) {
      throw createTsumoError(
        "TSUMO_CONFIG_DUPLICATE_FIELD",
        `${context} field '${property.key}' is declared more than once`,
        sourcePath,
        property.line,
        property.column,
      );
    }
    names.add(name);
  }
};

const toParam = (field: string, value: JsonValue, sourcePath?: string): ParamValue => {
  if (value instanceof JsonString) return ParamValue.string(value.value);
  if (value instanceof JsonBool) return ParamValue.bool(value.value);
  if (value instanceof JsonNumber) return ParamValue.number(requireInt(field, value, sourcePath));
  throw invalidField(field, "a string, boolean, or 32-bit integer", value, sourcePath);
};

const applyLanguageField = (
  builder: LanguageConfigBuilder,
  field: string,
  value: JsonValue,
  sourcePath?: string,
): void => {
  const normalized = field.toLowerCase();
  if (normalized === "languagename") builder.languageName = requireString(field, value, sourcePath);
  else if (normalized === "languagedirection") builder.languageDirection = requireString(field, value, sourcePath);
  else if (normalized === "contentdir") builder.contentDir = requireString(field, value, sourcePath);
  else if (normalized === "weight") builder.weight = requireInt(field, value, sourcePath);
  else {
    throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown language configuration field '${field}'`, sourcePath, value.line, value.column);
  }
};

const applyMenuField = (
  builder: MenuEntryBuilder,
  field: string,
  value: JsonValue,
  sourcePath?: string,
): void => {
  const normalized = field.toLowerCase();
  if (normalized === "name") builder.name = requireString(field, value, sourcePath);
  else if (normalized === "url") builder.url = requireString(field, value, sourcePath);
  else if (normalized === "pageref") builder.pageRef = requireString(field, value, sourcePath);
  else if (normalized === "title") builder.title = requireString(field, value, sourcePath);
  else if (normalized === "parent") builder.parent = requireString(field, value, sourcePath);
  else if (normalized === "identifier") builder.identifier = requireString(field, value, sourcePath);
  else if (normalized === "pre") builder.pre = requireString(field, value, sourcePath);
  else if (normalized === "post") builder.post = requireString(field, value, sourcePath);
  else if (normalized === "weight") builder.weight = requireInt(field, value, sourcePath);
  else {
    throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown menu configuration field '${field}'`, sourcePath, value.line, value.column);
  }
};

export const parseJsonConfig = (text: string, sourcePath?: string): SiteConfig => {
  const rootValue = parseJson(text, sourcePath);
  const root = requireObject("<root>", rootValue, sourcePath);
  assertUniqueFields(root, "Configuration", sourcePath);

  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let contentDir = "content";
  let theme: string | undefined;
  let copyright: string | undefined;
  let hasLanguageCode = false;
  const params = new Map<string, ParamValue>();
  const languages: LanguageConfig[] = [];
  const menus = new Map<string, MenuEntry[]>();

  for (let index = 0; index < root.properties.length; index++) {
    const property = root.properties[index]!;
    const key = property.key.toLowerCase();
    const value = property.value;
    if (key === "title") title = requireString(property.key, value, sourcePath);
    else if (key === "baseurl") baseURL = requireString(property.key, value, sourcePath);
    else if (key === "languagecode") {
      languageCode = requireString(property.key, value, sourcePath);
      hasLanguageCode = true;
    } else if (key === "contentdir") contentDir = requireString(property.key, value, sourcePath);
    else if (key === "theme") theme = requireString(property.key, value, sourcePath);
    else if (key === "copyright") copyright = requireString(property.key, value, sourcePath);
    else if (key === "params") {
      const object = requireObject(property.key, value, sourcePath);
      assertUniqueFields(object, "Configuration params", sourcePath);
      for (let paramIndex = 0; paramIndex < object.properties.length; paramIndex++) {
        const parameter = object.properties[paramIndex]!;
        params.set(parameter.key, toParam(parameter.key, parameter.value, sourcePath));
      }
    } else if (key === "languages") {
      const object = requireObject(property.key, value, sourcePath);
      assertUniqueFields(object, "Configuration languages", sourcePath);
      for (let languageIndex = 0; languageIndex < object.properties.length; languageIndex++) {
        const language = object.properties[languageIndex]!;
        const fields = requireObject(language.key, language.value, sourcePath);
        assertUniqueFields(fields, `Language '${language.key}'`, sourcePath);
        const builder = new LanguageConfigBuilder(language.key);
        for (let fieldIndex = 0; fieldIndex < fields.properties.length; fieldIndex++) {
          const field = fields.properties[fieldIndex]!;
          applyLanguageField(builder, field.key, field.value, sourcePath);
        }
        languages.push(builder.toConfig());
      }
    } else if (key === "menu") {
      const object = requireObject(property.key, value, sourcePath);
      assertUniqueFields(object, "Configuration menus", sourcePath);
      for (let menuIndex = 0; menuIndex < object.properties.length; menuIndex++) {
        const menu = object.properties[menuIndex]!;
        const menuItems = requireArray(menu.key, menu.value, sourcePath);
        const entries: MenuEntry[] = [];
        for (let entryIndex = 0; entryIndex < menuItems.items.length; entryIndex++) {
          const entryValue = menuItems.items[entryIndex]!;
          const fields = requireObject(`${menu.key}[${entryIndex}]`, entryValue, sourcePath);
          assertUniqueFields(fields, `Menu '${menu.key}' entry`, sourcePath);
          const builder = new MenuEntryBuilder(menu.key);
          for (let fieldIndex = 0; fieldIndex < fields.properties.length; fieldIndex++) {
            const field = fields.properties[fieldIndex]!;
            applyMenuField(builder, field.key, field.value, sourcePath);
          }
          entries.push(builder.toEntry());
        }
        menus.set(menu.key, buildMenuHierarchy(entries));
      }
    } else {
      throw createTsumoError("TSUMO_CONFIG_UNKNOWN_FIELD", `Unknown configuration field '${property.key}'`, sourcePath, property.line, property.column);
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme, copyright);
  config.contentDir = contentDir;
  config.Params = params;
  config.Menus = menus;
  if (languages.length > 0) {
    config.languages = sortLanguages(languages);
    const selected = config.languages[0]!;
    config.contentDir = selected.contentDir;
    if (!hasLanguageCode) config.languageCode = selected.lang;
  }
  return config;
};
