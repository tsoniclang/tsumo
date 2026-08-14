import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError, TsumoError } from "../diagnostics.js";
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
import { FrontMatter } from "./data.js";
import { FrontMatterMenu } from "./menu.js";

function invalidShape(field: string, expected: string, value: JsonValue, sourcePath?: string): TsumoError {
  return createTsumoError(
    "TSUMO_FRONTMATTER_FIELD_INVALID",
    `Front matter field '${field}' requires ${expected}`,
    sourcePath,
    value.line,
    value.column,
  );
}

const requireString = (field: string, value: JsonValue, sourcePath?: string): string => {
  if (value instanceof JsonString) return value.value;
  throw invalidShape(field, "a string", value, sourcePath);
};

const requireInt = (field: string, value: JsonValue, sourcePath?: string): int32 => {
  if (value instanceof JsonNumber) {
    const narrowed = toInt32(value.value);
    if (narrowed !== undefined) return narrowed;
  }
  throw invalidShape(field, "a 32-bit integer", value, sourcePath);
};

const requireStringArray = (field: string, value: JsonValue, sourcePath?: string): string[] => {
  if (!(value instanceof JsonArray)) throw invalidShape(field, "an array of strings", value, sourcePath);
  const array = value as JsonArray;
  const result: string[] = [];
  for (let index = 0; index < array.items.length; index++) {
    const item = array.items[index]!;
    if (item instanceof JsonString) result.push(item.value);
    else throw invalidShape(field, "an array containing only strings", item, sourcePath);
  }
  return result;
};

const toParam = (field: string, value: JsonValue, sourcePath?: string): ParamValue => {
  if (value instanceof JsonString) return ParamValue.string(value.value);
  if (value instanceof JsonBool) return ParamValue.bool(value.value);
  if (value instanceof JsonNumber) return ParamValue.number(requireInt(field, value, sourcePath));
  throw invalidShape(field, "a string, boolean, or 32-bit integer", value, sourcePath);
};

const assertCaseInsensitiveKeysUnique = (value: JsonObject, context: string, sourcePath?: string): void => {
  const keys = new Set<string>();
  for (let index = 0; index < value.properties.length; index++) {
    const property = value.properties[index]!;
    const key = property.key.toLowerCase();
    if (keys.has(key)) {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_FIELD_DUPLICATE",
        `${context} field '${property.key}' is declared more than once`,
        sourcePath,
        property.line,
        property.column,
      );
    }
    keys.add(key);
  }
};

const applyMenuProperty = (
  entry: FrontMatterMenu,
  keyRaw: string,
  value: JsonValue,
  sourcePath?: string,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "weight") entry.weight = requireInt(keyRaw, value, sourcePath);
  else if (key === "name") entry.name = requireString(keyRaw, value, sourcePath);
  else if (key === "parent") entry.parent = requireString(keyRaw, value, sourcePath);
  else if (key === "identifier") entry.identifier = requireString(keyRaw, value, sourcePath);
  else if (key === "pre") entry.pre = requireString(keyRaw, value, sourcePath);
  else if (key === "post") entry.post = requireString(keyRaw, value, sourcePath);
  else if (key === "title") entry.title = requireString(keyRaw, value, sourcePath);
  else {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_MENU_FIELD_UNKNOWN",
      `Unknown front matter menu field '${keyRaw}'`,
      sourcePath,
      value.line,
      value.column,
    );
  }
};

export const parseJsonFrontMatter = (text: string, sourcePath?: string): FrontMatter => {
  const rootValue = parseJson(text, sourcePath);
  if (!(rootValue instanceof JsonObject)) {
    throw createTsumoError("TSUMO_FRONTMATTER_ROOT_INVALID", "JSON front matter requires an object", sourcePath, rootValue.line, rootValue.column);
  }
  const root = rootValue as JsonObject;
  assertCaseInsensitiveKeysUnique(root, "Front matter", sourcePath);

  const frontMatter = new FrontMatter();
  for (let index = 0; index < root.properties.length; index++) {
    const property = root.properties[index]!;
    const key = property.key.toLowerCase();
    const value = property.value;
    if (key === "title") frontMatter.title = requireString(property.key, value, sourcePath);
    else if (key === "description") frontMatter.description = requireString(property.key, value, sourcePath);
    else if (key === "slug") frontMatter.slug = requireString(property.key, value, sourcePath);
    else if (key === "layout") frontMatter.layout = requireString(property.key, value, sourcePath);
    else if (key === "type") frontMatter.type = requireString(property.key, value, sourcePath);
    else if (key === "draft") {
      if (value instanceof JsonBool) frontMatter.draft = value.value;
      else throw invalidShape(property.key, "a boolean", value, sourcePath);
    } else if (key === "date") {
      const authored = requireString(property.key, value, sourcePath);
      const milliseconds = Date.parse(authored);
      if (Number.isNaN(milliseconds)) {
        throw createTsumoError("TSUMO_FRONTMATTER_INVALID_DATE", `Invalid front matter date: ${authored}`, sourcePath, value.line, value.column);
      }
      frontMatter.date = new Date(milliseconds);
    } else if (key === "tags") frontMatter.tags = requireStringArray(property.key, value, sourcePath);
    else if (key === "categories") frontMatter.categories = requireStringArray(property.key, value, sourcePath);
    else if (key === "params") {
      if (!(value instanceof JsonObject)) throw invalidShape(property.key, "an object of scalar values", value, sourcePath);
      const params = value as JsonObject;
      assertCaseInsensitiveKeysUnique(params, "Front matter params", sourcePath);
      for (let paramIndex = 0; paramIndex < params.properties.length; paramIndex++) {
        const parameter = params.properties[paramIndex]!;
        frontMatter.Params.set(parameter.key, toParam(parameter.key, parameter.value, sourcePath));
      }
    } else if (key === "menu") {
      if (!(value instanceof JsonObject)) throw invalidShape(property.key, "an object", value, sourcePath);
      const menuObject = value as JsonObject;
      assertCaseInsensitiveKeysUnique(menuObject, "Front matter menu", sourcePath);
      for (let menuIndex = 0; menuIndex < menuObject.properties.length; menuIndex++) {
        const menu = menuObject.properties[menuIndex]!;
        if (!(menu.value instanceof JsonObject)) throw invalidShape(menu.key, "a menu property object", menu.value, sourcePath);
        const menuFields = menu.value as JsonObject;
        assertCaseInsensitiveKeysUnique(menuFields, `Front matter menu '${menu.key}'`, sourcePath);
        const entry = new FrontMatterMenu(menu.key);
        for (let fieldIndex = 0; fieldIndex < menuFields.properties.length; fieldIndex++) {
          const field = menuFields.properties[fieldIndex]!;
          applyMenuProperty(entry, field.key, field.value, sourcePath);
        }
        frontMatter.menus.push(entry);
      }
    } else {
      frontMatter.Params.set(property.key, toParam(property.key, value, sourcePath));
    }
  }
  return frontMatter;
};
