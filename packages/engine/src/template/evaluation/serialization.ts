import { Uri, UriKind } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { createTsumoError } from "../../diagnostics.js";
import { substringCount, substringFrom } from "../../utils/strings.js";
import { AnyArrayValue, BoolValue, DictValue, HtmlValue, NilValue, NumberValue, StringValue, TemplateValue } from "../values.js";

export const getPathExtension = (path: string): string => {
  const lastDot = path.lastIndexOf(".");
  if (lastDot < 0) return "";
  return substringFrom(path, lastDot);
};

export const toJson = (value: TemplateValue): string => {
  if (value instanceof NilValue) return "null";
  if (value instanceof BoolValue) return value.value ? "true" : "false";
  if (value instanceof NumberValue) return `${value.value}`;
  if (value instanceof StringValue) return toJsonString(value.value);
  if (value instanceof HtmlValue) return toJsonString(value.value.value);
  if (value instanceof AnyArrayValue) {
    const items = value.value;
    const sb = new StringBuilder();
    sb.Append("[");
    let first = true;
    for (let i = 0; i < items.length; i++) {
      if (!first) sb.Append(",");
      first = false;
      sb.Append(toJson(items[i]!));
    }
    sb.Append("]");
    return sb.ToString();
  }
  if (value instanceof DictValue) {
    const sb = new StringBuilder();
    sb.Append("{");
    let first = true;
    for (const k of value.value.keys()) {
      const v = value.value.get(k);
      if (v === undefined) continue;
      if (!first) sb.Append(",");
      first = false;
      sb.Append(toJsonString(k));
      sb.Append(":");
      sb.Append(toJson(v));
    }
    sb.Append("}");
    return sb.ToString();
  }
  return "null";
};

export const toJsonString = (value: string): string => {
  const sb = new StringBuilder();
  sb.Append("\"");
  for (let i = 0; i < value.length; i++) {
    const ch = substringCount(value, i, 1);
    if (ch === "\\") sb.Append("\\\\");
    else if (ch === "\"") sb.Append("\\\"");
    else if (ch === "\n") sb.Append("\\n");
    else if (ch === "\r") sb.Append("\\r");
    else if (ch === "\t") sb.Append("\\t");
    else sb.Append(ch);
  }
  sb.Append("\"");
  return sb.ToString();
};

export const parseUrl = (value: string): Uri => {
  const trimmed = value.trim();
  try {
    return new Uri(trimmed, UriKind.RelativeOrAbsolute);
  } catch (_error) {
    throw createTsumoError("TSUMO_TEMPLATE_URL_INVALID", `Invalid URL: ${value}`);
  }
};

export const trimStartCharacter = (value: string, ch: string): string => {
  let start = 0;
  while (start < value.length && substringCount(value, start, 1) === ch) start++;
  return substringFrom(value, start);
};

export const trimEndCharacter = (value: string, ch: string): string => {
  let end = value.length;
  while (end > 0 && substringCount(value, end - 1, 1) === ch) end--;
  return substringCount(value, 0, end);
};

export const trimSlashes = (value: string): string => {
  const withoutLeading = trimStartCharacter(value, "/");
  return trimEndCharacter(withoutLeading, "/");
};

export const trimRightWhitespace = (s: string): string => {
  return s.trimEnd();
};
