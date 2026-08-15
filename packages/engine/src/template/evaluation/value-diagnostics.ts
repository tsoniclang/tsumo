import { ShortcodeValue } from "../contexts.js";
import {
  AnyArrayValue, BoolValue, DateValue, DictValue, HtmlValue, MenuArrayValue, MenuEntryValue,
  MenusValue, NilValue, NumberValue, OutputFormatValue, OutputFormatsGetValue, OutputFormatsValue,
  PageArrayValue, PageResourcesValue, PageValue, ResourceNamespaceValue, ResourceValue, ScratchValue,
  SiteValue, SitesArrayValue, SitesValue, StringArrayValue, StringValue, TaxonomiesValue,
  TaxonomyTermsValue, TemplateValue, UrlQueryValue, UrlValue,
} from "../values.js";
import { PageResourceCollectionValue } from "./page-resource-semantics.js";

export const templateValueDiagnosticKind = (value: TemplateValue): string => {
  if (value instanceof NilValue) return "nil";
  if (value instanceof StringValue) return "string";
  if (value instanceof BoolValue) return "boolean";
  if (value instanceof NumberValue) return "number";
  if (value instanceof HtmlValue) return "safe HTML";
  if (value instanceof DateValue) return "date";
  if (value instanceof DictValue) return "dictionary";
  if (value instanceof ScratchValue) return "scratch store";
  if (value instanceof UrlQueryValue) return "URL query";
  if (value instanceof UrlValue) return "URL";
  if (value instanceof ResourceNamespaceValue) return "global resource namespace";
  if (value instanceof ResourceValue) return "resource";
  if (value instanceof PageResourcesValue) return "page resource namespace";
  if (value instanceof PageResourceCollectionValue) return "page resource collection";
  if (value instanceof OutputFormatsValue) return "output-format collection";
  if (value instanceof OutputFormatsGetValue) return "output-format selector";
  if (value instanceof OutputFormatValue) return "output format";
  if (value instanceof PageValue) return "page";
  if (value instanceof PageArrayValue) return "page collection";
  if (value instanceof SiteValue) return "site";
  if (value instanceof SitesValue || value instanceof SitesArrayValue) return "site collection";
  if (value instanceof ShortcodeValue) return "shortcode";
  if (value instanceof StringArrayValue) return "string collection";
  if (value instanceof AnyArrayValue) return "value collection";
  if (value instanceof MenuEntryValue) return "menu entry";
  if (value instanceof MenuArrayValue || value instanceof MenusValue) return "menu collection";
  if (value instanceof TaxonomiesValue || value instanceof TaxonomyTermsValue) return "taxonomy collection";
  return "unsupported template value";
};
