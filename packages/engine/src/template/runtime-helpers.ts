import { escapeHtml } from "../utils/html.js";
import { parseInt32 } from "../utils/int32.js";
import { createTsumoError } from "../diagnostics.js";
import type { int32 } from "@tsonic/core/types.js";
import {
  TemplateValue, NilValue, BoolValue, NumberValue, StringValue, HtmlValue, DateValue,
  PageValue, DictValue, PageArrayValue, StringArrayValue, SitesArrayValue,
  DocsMountArrayValue, MenuArrayValue, MenusValue, NavArrayValue, AnyArrayValue,
  TaxonomiesValue, TaxonomyTermsValue,
  VersionStringValue, DeferredTemplateValue,
} from "./values.js";

export const nil: TemplateValue = new NilValue();

export const isTemplateMap = (value: TemplateValue): boolean =>
  value instanceof DictValue ||
  value instanceof MenusValue ||
  value instanceof TaxonomiesValue ||
  value instanceof TaxonomyTermsValue;

export const isTemplateSlice = (value: TemplateValue): boolean =>
  value instanceof AnyArrayValue ||
  value instanceof DocsMountArrayValue ||
  value instanceof MenuArrayValue ||
  value instanceof NavArrayValue ||
  value instanceof PageArrayValue ||
  value instanceof SitesArrayValue ||
  value instanceof StringArrayValue;

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

  if (value instanceof DateValue) return value.value.trim() !== "";

  if (value instanceof DictValue) return value.value.size > 0;
  if (value instanceof PageArrayValue) return value.value.length > 0;
  if (value instanceof StringArrayValue) return value.value.length > 0;
  if (value instanceof SitesArrayValue) return value.value.length > 0;
  if (value instanceof DocsMountArrayValue) return value.value.length > 0;
  if (value instanceof NavArrayValue) return value.value.length > 0;
  if (value instanceof AnyArrayValue) return value.value.length > 0;

  return true;
};

export const isDefaultSet = (value: TemplateValue): boolean => {
  if (value instanceof NilValue) return false;
  if (value instanceof BoolValue) return true;
  if (value instanceof NumberValue) return value.value !== 0;
  if (value instanceof StringValue) return value.value !== "";
  if (value instanceof HtmlValue) return value.value.value !== "";
  if (value instanceof DateValue) return value.value.trim() !== "";
  if (value instanceof DictValue) return value.value.size > 0;
  if (value instanceof PageArrayValue) return value.value.length > 0;
  if (value instanceof StringArrayValue) return value.value.length > 0;
  if (value instanceof SitesArrayValue) return value.value.length > 0;
  if (value instanceof DocsMountArrayValue) return value.value.length > 0;
  if (value instanceof NavArrayValue) return value.value.length > 0;
  if (value instanceof AnyArrayValue) return value.value.length > 0;
  return true;
};

export const stringify = (value: TemplateValue, escape: boolean): string => {
  if (value instanceof DeferredTemplateValue) {
    throw createTsumoError("TSUMO_TEMPLATE_DEFER_CONTEXT_INVALID", "templates.Defer can only be evaluated by a with block");
  }
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
    return `${value.value}`;
  }
  if (value instanceof DateValue) return escape ? escapeHtml(value.value) : value.value;
  return "";
};

export const toPlainString = (value: TemplateValue): string => {
  if (value instanceof DeferredTemplateValue) {
    throw createTsumoError("TSUMO_TEMPLATE_DEFER_CONTEXT_INVALID", "templates.Defer cannot be converted to text outside a with block");
  }
  if (value instanceof StringValue) {
    return value.value;
  }

  if (value instanceof HtmlValue) {
    return value.value.value;
  }

  if (value instanceof DateValue) return value.value;

  if (value instanceof BoolValue) {
    return value.value ? "true" : "false";
  }

  if (value instanceof NumberValue) {
    return `${value.value}`;
  }

  if (value instanceof PageValue) {
    return value.value.relPermalink;
  }

  if (value instanceof VersionStringValue) {
    return value.value;
  }

  return "";
};

export const toNumber = (value: TemplateValue): int32 => {
  if (value instanceof NumberValue) return value.value;
  if (value instanceof StringValue) return parseInt32(value.value) ?? 0;
  if (value instanceof BoolValue) return value.value ? 1 : 0;
  return 0;
};
