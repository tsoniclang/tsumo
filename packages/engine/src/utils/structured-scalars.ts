import type { int32 } from "@tsonic/core/types.js";
import { Char } from "@tsonic/dotnet/System.js";

import type { TsumoError } from "../diagnostics.js";
import { ParamValue } from "../params.js";
import { parseInt32 } from "./int32.js";
import { indexOfText, substringCount, substringFrom } from "./strings.js";

export type StructuredScalarFormat = "toml" | "yaml";
export type StructuredScalarErrorFactory = (message: string) => TsumoError;

const hexValue = (character: string): int32 => indexOfText("0123456789abcdef", character.toLowerCase());

const decodeHexEscape = (
  source: string,
  start: int32,
  count: int32,
  invalid: StructuredScalarErrorFactory,
): string => {
  if (start + count > source.length) throw invalid(`String escape requires ${count} hexadecimal digits`);
  let value: int32 = 0;
  for (let offset: int32 = 0; offset < count; offset++) {
    const digit = hexValue(source[start + offset]!);
    if (digit < 0) throw invalid("String escape contains a non-hexadecimal digit");
    value = value * 16 + digit;
  }
  if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    throw invalid("String escape does not name a Unicode scalar value");
  }
  return Char.ConvertFromUtf32(value);
};

const decodeSingleQuoted = (
  inner: string,
  format: StructuredScalarFormat,
  invalid: StructuredScalarErrorFactory,
): string => {
  let result = "";
  for (let index: int32 = 0; index < inner.length; index++) {
    const current = inner[index]!;
    if (current !== "'") {
      result += current;
      continue;
    }
    if (format === "yaml" && index + 1 < inner.length && inner[index + 1] === "'") {
      result += "'";
      index++;
      continue;
    }
    throw invalid("Single-quoted string contains an unescaped quote");
  }
  return result;
};

const decodeDoubleQuoted = (inner: string, invalid: StructuredScalarErrorFactory): string => {
  let result = "";
  for (let index: int32 = 0; index < inner.length; index++) {
    const current = inner[index]!;
    if (current === "\"") throw invalid("Double-quoted string contains an unescaped quote");
    if (current !== "\\") {
      result += current;
      continue;
    }
    if (index + 1 >= inner.length) throw invalid("String ends with an incomplete escape");
    const escaped = inner[++index]!;
    if (escaped === "\"" || escaped === "\\" || escaped === "/") result += escaped;
    else if (escaped === "b") result += "\b";
    else if (escaped === "t") result += "\t";
    else if (escaped === "n") result += "\n";
    else if (escaped === "f") result += "\f";
    else if (escaped === "r") result += "\r";
    else if (escaped === "u") {
      result += decodeHexEscape(inner, index + 1, 4, invalid);
      index += 4;
    } else if (escaped === "U") {
      result += decodeHexEscape(inner, index + 1, 8, invalid);
      index += 8;
    } else throw invalid(`Unsupported string escape '\\${escaped}'`);
  }
  return result;
};

const decodeQuoted = (
  value: string,
  format: StructuredScalarFormat,
  invalid: StructuredScalarErrorFactory,
): string | undefined => {
  const first = value.length === 0 ? "" : value[0]!;
  const last = value.length === 0 ? "" : value[value.length - 1]!;
  const startsQuoted = first === "\"" || first === "'";
  const endsQuoted = last === "\"" || last === "'";
  if (!startsQuoted && !endsQuoted) return undefined;
  if (!startsQuoted) {
    if (format === "yaml") return undefined;
    throw invalid("String has mismatched quotes");
  }
  if (first !== last || value.length < 2) throw invalid("String has mismatched quotes");
  const inner = substringCount(value, 1, value.length - 2);
  return first === "'" ? decodeSingleQuoted(inner, format, invalid) : decodeDoubleQuoted(inner, invalid);
};

const parseInteger = (value: string, invalid: StructuredScalarErrorFactory): ParamValue | undefined => {
  const integerLike = /^[+-]?[0-9_]+$/.test(value);
  if (!integerLike) return undefined;
  if (!/^[+-]?(?:0|[1-9](?:_?[0-9])*)$/.test(value)) {
    throw invalid("Integer has invalid leading zeroes or underscore placement");
  }
  let normalized = value.replaceAll("_", "");
  if (normalized.startsWith("+")) normalized = substringFrom(normalized, 1);
  const parsed = parseInt32(normalized);
  if (parsed === undefined) throw invalid("Integer is outside the supported 32-bit range");
  return ParamValue.number(parsed);
};

export const parseStructuredScalar = (
  value: string,
  format: StructuredScalarFormat,
  invalid: StructuredScalarErrorFactory,
): ParamValue => {
  const trimmed = value.trim();
  const quoted = decodeQuoted(trimmed, format, invalid);
  if (quoted !== undefined) return ParamValue.string(quoted);
  if (format === "toml") {
    if (trimmed === "true") return ParamValue.bool(true);
    if (trimmed === "false") return ParamValue.bool(false);
  } else {
    const normalized = trimmed.toLowerCase();
    if (normalized === "true") return ParamValue.bool(true);
    if (normalized === "false") return ParamValue.bool(false);
  }
  const integer = parseInteger(trimmed, invalid);
  if (integer !== undefined) return integer;
  if (format === "toml") throw invalid("TOML string values must be quoted");
  return ParamValue.string(trimmed);
};

export const stripStructuredComment = (line: string, format: StructuredScalarFormat): string => {
  let quote = "";
  let escaped = false;
  for (let index: int32 = 0; index < line.length; index++) {
    const current = line[index]!;
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
      else if (quote === current) {
        if (quote === "'" && format === "yaml" && index + 1 < line.length && line[index + 1] === "'") index++;
        else quote = "";
      }
      continue;
    }
    const yamlComment = format === "yaml" && current === "#" && (index === 0 || /\s/.test(line[index - 1]!));
    if ((format === "toml" && current === "#" && quote === "") || (yamlComment && quote === "")) {
      return substringCount(line, 0, index).trimEnd();
    }
  }
  return line;
};
