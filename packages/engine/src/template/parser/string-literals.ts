import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../../diagnostics.js";
import type { TsumoError } from "../../diagnostics.js";
import {
  codePointAtText,
  indexOfText,
  nextCodePointIndex,
  substringCount,
} from "../../utils/strings.js";

function invalidStringLiteral(message: string): TsumoError {
  return createTsumoError("TSUMO_TEMPLATE_STRING_ESCAPE_INVALID", message);
}

const digitValue = (character: string, radix: int32): int32 => {
  const value = indexOfText("0123456789abcdef", character.toLowerCase());
  return value >= 0 && value < radix ? value : -1;
};

const decodeFixedEscape = (
  source: string,
  start: int32,
  count: int32,
  radix: int32,
  maximum: int32,
  description: string,
): string => {
  if (start + count > source.length) {
    throw invalidStringLiteral(`${description} requires exactly ${count} digits`);
  }

  let value: int32 = 0;
  for (let offset: int32 = 0; offset < count; offset++) {
    const digit = digitValue(codePointAtText(source, start + offset), radix);
    if (digit < 0) throw invalidStringLiteral(`${description} contains an invalid digit`);
    const maximumBeforeDigit = Math.floor((maximum - digit) / radix) as int32;
    if (value > maximumBeforeDigit) {
      throw invalidStringLiteral(`${description} is outside its valid range`);
    }
    value = value * radix + digit;
  }

  if (value >= 0xd800 && value <= 0xdfff) {
    throw invalidStringLiteral(`${description} does not name a Unicode scalar value`);
  }
  return String.fromCodePoint(value);
};

const decodeInterpretedString = (inner: string, quote: string): string => {
  let result = "";
  let index: int32 = 0;

  while (index < inner.length) {
    const current = codePointAtText(inner, index);
    if (current === "\n" || current === "\r") {
      throw invalidStringLiteral("Interpreted template strings cannot contain unescaped line breaks");
    }
    if (current !== "\\") {
      result += current;
      index = nextCodePointIndex(inner, index);
      continue;
    }

    const escapeIndex = nextCodePointIndex(inner, index);
    if (escapeIndex >= inner.length) throw invalidStringLiteral("Template string ends with an incomplete escape");
    const escaped = codePointAtText(inner, escapeIndex);
    if (escaped === quote || escaped === "\\") {
      result += escaped;
      index = nextCodePointIndex(inner, escapeIndex);
      continue;
    }
    if (escaped === "a") result += "\u0007";
    else if (escaped === "b") result += "\b";
    else if (escaped === "f") result += "\f";
    else if (escaped === "n") result += "\n";
    else if (escaped === "r") result += "\r";
    else if (escaped === "t") result += "\t";
    else if (escaped === "v") result += "\u000b";
    else if (digitValue(escaped, 8) >= 0) {
      result += decodeFixedEscape(inner, escapeIndex, 3, 8, 0xff, "Octal template string escape");
      index = escapeIndex + 3;
      continue;
    } else if (escaped === "x") {
      result += decodeFixedEscape(inner, escapeIndex + 1, 2, 16, 0xff, "Hexadecimal template string escape");
      index = escapeIndex + 3;
      continue;
    } else if (escaped === "u") {
      result += decodeFixedEscape(inner, escapeIndex + 1, 4, 16, 0x10ffff, "Unicode template string escape");
      index = escapeIndex + 5;
      continue;
    } else if (escaped === "U") {
      result += decodeFixedEscape(inner, escapeIndex + 1, 8, 16, 0x10ffff, "Unicode template string escape");
      index = escapeIndex + 9;
      continue;
    } else {
      throw invalidStringLiteral(`Unsupported template string escape '\\${escaped}'`);
    }
    index = nextCodePointIndex(inner, escapeIndex);
  }

  return result;
};

export const decodeTemplateStringLiteral = (token: string): string | undefined => {
  const value = token.trim();
  if (value.length < 2) return undefined;
  const quote = codePointAtText(value, 0);
  if (quote !== "\"" && quote !== "'" && quote !== "`") return undefined;
  if (!value.endsWith(quote)) return undefined;

  const inner = substringCount(value, 1, value.length - 2);
  return quote === "`" ? inner.replaceAll("\r", "") : decodeInterpretedString(inner, quote);
};
