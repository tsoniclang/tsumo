// Re-export all APIs from template modules

// Value types
export {
  TemplateValue, NilValue, StringValue, BoolValue, NumberValue, HtmlValue,
  PageValue, SiteValue, LanguageValue, FileValue, SitesValue,
  ResourceDataValue, ResourceValue, PageResourcesValue,
  PageArrayValue, StringArrayValue, SitesArrayValue, AnyArrayValue,
  DocsMountValue, DocsMountArrayValue, NavItemValue, NavArrayValue,
  MenuEntryValue, MenuArrayValue, MenusValue,
  OutputFormatsValue, OutputFormatValue, OutputFormatsGetValue,
  TaxonomiesValue, TaxonomyTermsValue, MediaTypeValue,
  DictValue, ScratchStore, ScratchValue, UrlParts, UrlValue,
} from "./values.js";

// Context types
export {
  ShortcodeContext, ShortcodeValue,
  LinkHookContext, LinkHookValue,
  ImageHookContext, ImageHookValue,
  HeadingHookContext, HeadingHookValue,
} from "./contexts.js";

// Scope
export { RenderScope } from "./scope.js";

// Environment
export { TemplateEnvironment } from "./environment.js";

// Template nodes
export {
  TemplateNode, TextNode, OutputNode, AssignmentNode,
  TemplateInvokeNode, IfNode, RangeNode, WithNode, BlockNode,
} from "./nodes.js";

// Template class
export { Template } from "./template.js";

// Runtime helpers (used by markdown.ts)
export { nil, isTruthy, stringify, toPlainString } from "./runtime-helpers.js";

// Syntax and parsing
export { Pipeline, Expr, Command } from "./syntax/expressions.js";
export { parseTemplate } from "./parser/parse-template.js";
