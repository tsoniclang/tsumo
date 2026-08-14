import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { ParamKind, ParamValue } from "../params.js";
import { substringCount } from "../utils/strings.js";
import { parseStructuredScalar, StructuredScalarFormat } from "../utils/structured-scalars.js";
import { FrontMatter } from "./data.js";

export const parseFrontMatterParam = (
  value: string,
  format: StructuredScalarFormat,
  sourcePath?: string,
  line?: int32,
): ParamValue => parseStructuredScalar(value, format, (message: string) =>
  createTsumoError("TSUMO_FRONTMATTER_SCALAR_INVALID", message, sourcePath, line, 1));

export const parseFrontMatterString = (
  value: string,
  field: string,
  format: StructuredScalarFormat,
  sourcePath?: string,
  line?: int32,
): string => {
  const parsed = parseFrontMatterParam(value, format, sourcePath, line);
  if (parsed.kind === ParamKind.String) return parsed.stringValue;
  throw createTsumoError(
    "TSUMO_FRONTMATTER_FIELD_INVALID",
    `Front matter field '${field}' requires a string`,
    sourcePath,
    line,
    1,
  );
};

export const recordFrontMatterField = (
  fields: Set<string>,
  field: string,
  context: string,
  sourcePath?: string,
  line?: int32,
): void => {
  const normalized = field.toLowerCase();
  if (fields.has(normalized)) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_FIELD_DUPLICATE",
      `${context} field '${field}' is declared more than once`,
      sourcePath,
      line,
      1,
    );
  }
  fields.add(normalized);
};

export const parseFrontMatterInt = (
  value: string,
  field: string,
  format: StructuredScalarFormat,
  sourcePath?: string,
  line?: int32,
): int32 => {
  const parsed = parseFrontMatterParam(value, format, sourcePath, line);
  if (parsed.kind !== ParamKind.Number) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_INVALID_INTEGER",
      `Front matter field '${field}' requires a 32-bit integer`,
      sourcePath,
      line,
      1,
    );
  }
  return parsed.numberValue;
};

export const parseFrontMatterStringArray = (
  value: string,
  field: string,
  format: StructuredScalarFormat,
  sourcePath?: string,
  line?: int32,
): string[] => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_INVALID_STRING_ARRAY",
      `Front matter field '${field}' requires a string array`,
      sourcePath,
      line,
      1,
    );
  }

  const inner = substringCount(trimmed, 1, trimmed.length - 2);
  if (inner.trim() === "") return [];

  const values: string[] = [];
  let start: int32 = 0;
  let quote = "";
  let escaped = false;
  for (let index: int32 = 0; index <= inner.length; index++) {
    const current = index < inner.length ? inner[index]! : ",";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "\"" || current === "'") {
      if (quote === "") quote = current;
      else if (quote === current) quote = "";
      continue;
    }
    if (current !== "," || quote !== "") continue;
    const item = substringCount(inner, start, index - start).trim();
    if (item === "") {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_INVALID_STRING_ARRAY",
        `Front matter field '${field}' contains an empty array item`,
        sourcePath,
        line,
        1,
      );
    }
    values.push(parseFrontMatterString(item, field, format, sourcePath, line));
    start = index + 1;
  }
  if (quote !== "") {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_STRING_INVALID",
      `Front matter field '${field}' contains an unterminated string`,
      sourcePath,
      line,
      1,
    );
  }
  return values;
};

export const applyFrontMatterScalar = (
  frontMatter: FrontMatter,
  keyRaw: string,
  valueRaw: string,
  format: StructuredScalarFormat,
  sourcePath?: string,
  line?: int32,
): void => {
  const key = keyRaw.trim().toLowerCase();
  const value = valueRaw.trim();
  if (key === "title") frontMatter.title = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
  else if (key === "date") {
    const authored = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
    const milliseconds = Date.parse(authored);
    if (Number.isNaN(milliseconds)) {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_INVALID_DATE",
        `Invalid front matter date: ${authored}`,
        sourcePath,
        line,
        1,
      );
    }
    frontMatter.date = new Date(milliseconds);
  } else if (key === "draft") {
    const parsed = parseFrontMatterParam(value, format, sourcePath, line);
    if (parsed.kind !== ParamKind.Bool) {
      throw createTsumoError(
        "TSUMO_FRONTMATTER_INVALID_BOOL",
        `Front matter field '${keyRaw.trim()}' requires true or false`,
        sourcePath,
        line,
        1,
      );
    }
    frontMatter.draft = parsed.boolValue;
  } else if (key === "description") frontMatter.description = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
  else if (key === "slug") frontMatter.slug = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
  else if (key === "layout") frontMatter.layout = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
  else if (key === "type") frontMatter.type = parseFrontMatterString(value, keyRaw.trim(), format, sourcePath, line);
  else if (key === "tags") frontMatter.tags = parseFrontMatterStringArray(value, "tags", format, sourcePath, line);
  else if (key === "categories") frontMatter.categories = parseFrontMatterStringArray(value, "categories", format, sourcePath, line);
  else frontMatter.Params.set(keyRaw.trim(), parseFrontMatterParam(value, format, sourcePath, line));
};
