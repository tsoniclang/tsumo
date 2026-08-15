import type { int32, uint8 } from "@tsonic/core/types.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { UTF8Encoding } from "@tsonic/dotnet/System.Text.js";
import { substringCount } from "./strings.js";

const strictUtf8 = new UTF8Encoding(false, true);

const hexValue = (value: string): int32 => {
  const code = value.charCodeAt(0);
  if (code >= 48 && code <= 57) return (code - 48) as int32;
  if (code >= 65 && code <= 70) return (code - 55) as int32;
  if (code >= 97 && code <= 102) return (code - 87) as int32;
  return -1;
};

const appendUtf8 = (output: List<uint8>, value: string): void => {
  const encoded = strictUtf8.GetBytes(value);
  for (let index = 0; index < encoded.length; index++) output.Add(encoded[index]!);
};

export const decodeUrlComponent = (value: string): string => {
  const decoded = new List<uint8>();
  let literalStart = 0;
  let index = 0;
  while (index < value.length) {
    if (substringCount(value, index, 1) !== "%") {
      index++;
      continue;
    }
    if (literalStart < index) appendUtf8(decoded, substringCount(value, literalStart, index - literalStart));
    if (index + 2 >= value.length) throw new Exception("URL component contains an incomplete percent escape");
    const high = hexValue(substringCount(value, index + 1, 1));
    const low = hexValue(substringCount(value, index + 2, 1));
    if (high < 0 || low < 0) throw new Exception("URL component contains an invalid percent escape");
    decoded.Add((high * 16 + low) as uint8);
    index += 3;
    literalStart = index;
  }
  if (literalStart < value.length) appendUtf8(decoded, substringCount(value, literalStart, value.length - literalStart));
  return strictUtf8.GetString(decoded.ToArray());
};
