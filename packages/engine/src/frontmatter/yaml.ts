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

const indentationOf = (line: string): int32 => {
  let indentation: int32 = 0;
  while (indentation < line.length && line[indentation] === " ") indentation++;
  return indentation;
};

const yamlText = (line: string): string => stripStructuredComment(line, "yaml").trim();

const splitYamlPair = (
  text: string,
  sourcePath: string | undefined,
  line: int32,
): string[] => {
  const separator = text.indexOf(":");
  if (separator <= 0) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID",
      "YAML front matter entries require 'key: value' syntax",
      sourcePath,
      line,
      1,
    );
  }
  return [substringCount(text, 0, separator).trim(), substringFrom(text, separator + 1).trim()];
};

const applyMenuProperty = (
  entry: FrontMatterMenu,
  keyRaw: string,
  valueRaw: string,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const key = keyRaw.toLowerCase();
  if (key === "weight") entry.weight = parseFrontMatterInt(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "name") entry.name = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "parent") entry.parent = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "identifier") entry.identifier = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "pre") entry.pre = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "post") entry.post = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
  else if (key === "title") entry.title = parseFrontMatterString(valueRaw, keyRaw, "yaml", sourcePath, line);
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

const validateYamlLine = (line: string, sourcePath: string | undefined, lineNumber: int32): void => {
  if (line.includes("\t")) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID",
      "YAML front matter indentation must use spaces",
      sourcePath,
      lineNumber,
      1,
    );
  }
};

export const parseYamlFrontMatter = (lines: string[], sourcePath?: string): FrontMatter => {
  const frontMatter = new FrontMatter();
  const rootFields = new Set<string>();
  let index: int32 = 0;
  while (index < lines.length) {
    const raw = lines[index]!;
    const lineNumber = index + 2;
    validateYamlLine(raw, sourcePath, lineNumber);
    const text = yamlText(raw);
    if (text === "" || text.startsWith("#")) {
      index++;
      continue;
    }
    if (indentationOf(raw) !== 0) {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID",
        "YAML front matter has an unexpected indented entry",
        sourcePath,
        lineNumber,
        1,
      );
    }

    const pair = splitYamlPair(text, sourcePath, lineNumber);
    const key = pair[0]!;
    const value = pair[1]!;
    recordFrontMatterField(rootFields, key, "Front matter", sourcePath, lineNumber);
    if (value !== "") {
      applyFrontMatterScalar(frontMatter, key, value, "yaml", sourcePath, lineNumber);
      index++;
      continue;
    }

    const normalizedKey = key.toLowerCase();
    index++;
    if (normalizedKey === "params") {
      const paramFields = new Set<string>();
      while (index < lines.length && indentationOf(lines[index]!) > 0) {
        const childRaw = lines[index]!;
        const childLine = index + 2;
        validateYamlLine(childRaw, sourcePath, childLine);
        const childText = yamlText(childRaw);
        if (childText !== "" && !childText.startsWith("#")) {
          if (indentationOf(childRaw) !== 2) {
            throw createTsumoError("TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID", "Front matter params require one scalar mapping level", sourcePath, childLine, 1);
          }
          const child = splitYamlPair(childText, sourcePath, childLine);
          if (child[1] === "") {
            throw createTsumoError("TSUMO_FRONTMATTER_PARAM_INVALID", `Front matter param '${child[0]}' requires a scalar value`, sourcePath, childLine, 1);
          }
          recordFrontMatterField(paramFields, child[0]!, "Front matter params", sourcePath, childLine);
          frontMatter.Params.set(child[0]!, parseFrontMatterParam(child[1]!, "yaml", sourcePath, childLine));
        }
        index++;
      }
      continue;
    }

    if (normalizedKey === "tags" || normalizedKey === "categories") {
      const values: string[] = [];
      while (index < lines.length && indentationOf(lines[index]!) > 0) {
        const childRaw = lines[index]!;
        const childLine = index + 2;
        validateYamlLine(childRaw, sourcePath, childLine);
        const childText = yamlText(childRaw);
        if (childText !== "" && !childText.startsWith("#")) {
          if (indentationOf(childRaw) !== 2 || !childText.startsWith("-")) {
            throw createTsumoError("TSUMO_FRONTMATTER_INVALID_STRING_ARRAY", `Front matter field '${key}' requires a scalar list`, sourcePath, childLine, 1);
          }
          const item = substringFrom(childText, 1).trim();
          if (item === "") {
            throw createTsumoError("TSUMO_FRONTMATTER_INVALID_STRING_ARRAY", `Front matter field '${key}' contains an empty list item`, sourcePath, childLine, 1);
          }
          values.push(parseFrontMatterString(item, key, "yaml", sourcePath, childLine));
        }
        index++;
      }
      if (normalizedKey === "tags") frontMatter.tags = values;
      else frontMatter.categories = values;
      continue;
    }

    if (normalizedKey === "menu") {
      const menuNames = new Set<string>();
      while (index < lines.length && indentationOf(lines[index]!) > 0) {
        const entryRaw = lines[index]!;
        const entryLine = index + 2;
        validateYamlLine(entryRaw, sourcePath, entryLine);
        const entryText = yamlText(entryRaw);
        if (entryText === "" || entryText.startsWith("#")) {
          index++;
          continue;
        }
        if (indentationOf(entryRaw) !== 2) {
          throw createTsumoError("TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID", "Front matter menu names require one mapping level", sourcePath, entryLine, 1);
        }
        const entryPair = splitYamlPair(entryText, sourcePath, entryLine);
        if (entryPair[1] !== "") {
          throw createTsumoError("TSUMO_FRONTMATTER_MENU_INVALID", `Front matter menu '${entryPair[0]}' requires a property mapping`, sourcePath, entryLine, 1);
        }
        recordFrontMatterField(menuNames, entryPair[0]!, "Front matter menu", sourcePath, entryLine);
        const entry = new FrontMatterMenu(entryPair[0]!);
        const menuFields = new Set<string>();
        index++;
        while (index < lines.length && indentationOf(lines[index]!) > 2) {
          const propertyRaw = lines[index]!;
          const propertyLine = index + 2;
          validateYamlLine(propertyRaw, sourcePath, propertyLine);
          const propertyText = yamlText(propertyRaw);
          if (propertyText !== "" && !propertyText.startsWith("#")) {
            if (indentationOf(propertyRaw) !== 4) {
              throw createTsumoError("TSUMO_FRONTMATTER_YAML_SYNTAX_INVALID", "Front matter menu properties require exactly two mapping levels", sourcePath, propertyLine, 1);
            }
            const property = splitYamlPair(propertyText, sourcePath, propertyLine);
            if (property[1] === "") {
              throw createTsumoError("TSUMO_FRONTMATTER_MENU_INVALID", `Front matter menu field '${property[0]}' requires a scalar value`, sourcePath, propertyLine, 1);
            }
            recordFrontMatterField(menuFields, property[0]!, `Front matter menu '${entry.menu}'`, sourcePath, propertyLine);
            applyMenuProperty(entry, property[0]!, property[1]!, sourcePath, propertyLine);
          }
          index++;
        }
        frontMatter.menus.push(entry);
      }
      continue;
    }

    throw createTsumoError(
      "TSUMO_FRONTMATTER_NESTED_VALUE_UNSUPPORTED",
      `Front matter field '${key}' does not support a nested value`,
      sourcePath,
      lineNumber,
      1,
    );
  }
  return frontMatter;
};
