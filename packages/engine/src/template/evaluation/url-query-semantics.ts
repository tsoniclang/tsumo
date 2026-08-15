import { createTsumoError } from "../../diagnostics.js";
import { replaceText, substringCount, substringFrom } from "../../utils/strings.js";
import { decodeUrlComponent } from "../../utils/url-components.js";
import { UrlQueryValue } from "../values.js";

const isHexDigit = (value: string): boolean => {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102);
};

const decodeQueryComponent = (value: string): string => {
  for (let index = 0; index < value.length; index++) {
    if (substringCount(value, index, 1) !== "%") continue;
    if (
      index + 2 >= value.length ||
      !isHexDigit(substringCount(value, index + 1, 1)) ||
      !isHexDigit(substringCount(value, index + 2, 1))
    ) {
      throw createTsumoError("TSUMO_TEMPLATE_URL_QUERY_INVALID", "URL query contains an invalid percent escape");
    }
    index += 2;
  }
  try {
    return decodeUrlComponent(replaceText(value, "+", " "));
  } catch (_error) {
    throw createTsumoError("TSUMO_TEMPLATE_URL_QUERY_INVALID", "URL query contains invalid UTF-8 data");
  }
};

export const parseUrlQuery = (rawQuery: string): UrlQueryValue => {
  const values = new Map<string, string[]>();
  if (rawQuery === "") return new UrlQueryValue(values);

  const fields = rawQuery.split("&");
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!;
    if (field === "") continue;
    const separator = field.indexOf("=");
    const rawName = separator < 0 ? field : substringCount(field, 0, separator);
    const rawValue = separator < 0 ? "" : substringFrom(field, separator + 1);
    const name = decodeQueryComponent(rawName);
    const value = decodeQueryComponent(rawValue);
    const existing = values.get(name);
    if (existing === undefined) values.set(name, [value]);
    else existing.push(value);
  }
  return new UrlQueryValue(values);
};

export const getUrlQueryValue = (query: Map<string, string[]>, name: string): string | undefined => {
  const values = query.get(name);
  return values === undefined || values.length === 0 ? undefined : values[0];
};
