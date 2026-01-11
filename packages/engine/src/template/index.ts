// Re-export all public APIs from template modules

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
} from "./values.ts";

// Context types
export {
  ShortcodeContext, ShortcodeValue,
  LinkHookContext, LinkHookValue,
  ImageHookContext, ImageHookValue,
  HeadingHookContext, HeadingHookValue,
} from "./contexts.ts";

// Scope
export { RenderScope } from "./scope.ts";

// Environment
export { TemplateEnvironment } from "./environment.ts";

// Template nodes
export {
  TemplateNode, TextNode, OutputNode, AssignmentNode,
  TemplateInvokeNode, IfNode, RangeNode, WithNode, BlockNode,
} from "./nodes.ts";

// Template class
export { Template } from "./template.ts";

// Runtime helpers (used by markdown.ts)
export { nil, isTruthy, stringify, toPlainString } from "./runtime-helpers.ts";

// Runtime and parsing
export { Pipeline, Expr, Command, parseTemplate } from "./runtime.ts";
