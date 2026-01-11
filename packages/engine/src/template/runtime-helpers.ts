import { escapeHtml } from "../utils/html.ts";
import {
  TemplateValue, NilValue, BoolValue, NumberValue, StringValue, HtmlValue,
  PageValue, DictValue, PageArrayValue, StringArrayValue, SitesArrayValue,
  DocsMountArrayValue, NavArrayValue, AnyArrayValue,
} from "./values.ts";

export const nil: TemplateValue = new NilValue();

export const isTruthy = (value: TemplateValue): boolean => {
  if (value instanceof NilValue) return false;

  if (value instanceof BoolValue) {
    return value.value;
  }

  if (value instanceof NumberValue) {
    return value.value !== 0;
  }

  if (value instanceof StringValue) {
    return value.value !== "";
  }

  if (value instanceof HtmlValue) {
    return value.value.value !== "";
  }

  if (value instanceof DictValue) return value.value.count > 0;
  if (value instanceof PageArrayValue) return value.value.length > 0;
  if (value instanceof StringArrayValue) return value.value.length > 0;
  if (value instanceof SitesArrayValue) return value.value.length > 0;
  if (value instanceof DocsMountArrayValue) return value.value.length > 0;
  if (value instanceof NavArrayValue) return value.value.length > 0;
  if (value instanceof AnyArrayValue) return value.value.count > 0;

  return true;
};

export const stringify = (value: TemplateValue, escape: boolean): string => {
  if (value instanceof NilValue) return "";
  if (value instanceof HtmlValue) {
    return value.value.value;
  }
  if (value instanceof StringValue) {
    const s = value.value;
    return escape ? escapeHtml(s) : s;
  }
  if (value instanceof BoolValue) {
    return value.value ? "true" : "false";
  }
  if (value instanceof NumberValue) {
    return value.value.toString();
  }
  return "";
};

export const toPlainString = (value: TemplateValue): string => {
  if (value instanceof StringValue) {
    return value.value;
  }

  if (value instanceof HtmlValue) {
    return value.value.value;
  }

  if (value instanceof BoolValue) {
    return value.value ? "true" : "false";
  }

  if (value instanceof NumberValue) {
    return value.value.toString();
  }

  if (value instanceof PageValue) {
    return value.value.relPermalink;
  }

  return "";
};
