import { Console } from "@tsonic/dotnet/System.js";
import { WebUtility } from "@tsonic/dotnet/System.Net.js";
import { createTsumoError } from "../../diagnostics.js";
import { HtmlString, escapeHtml } from "../../utils/html.js";
import { replaceText, substringFrom } from "../../utils/strings.js";
import { PartialTemplateResolution } from "../environment.js";
import {
  BoolValue, DeferredTemplateValue, DictValue, HtmlValue, StringValue, TemplateValue,
} from "../values.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { toTitleCase } from "../evaluation/page-semantics.js";
import { formatDateTime } from "../evaluation/scalar-semantics.js";
import { getPathExtension, trimEndCharacter } from "../evaluation/serialization.js";
import { unmarshalTemplateData } from "../evaluation/structured-data.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";

const renderPartialResolution = (
  selected: PartialTemplateResolution,
  contextValue: TemplateValue,
  context: TemplateFunctionContext,
): string => {
  const environment = context.environment;
  const scope = context.scope;
  if (selected.kind === "definition") {
    const definition = selected.definition;
    if (definition === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_RESOLUTION_INVALID", "Template partial definition has no body");
    }
    return environment.renderTemplateDefinition(
      definition,
      context.defines,
      selected.sourcePath,
      contextValue,
      scope.site,
      context.overrides,
      scope.state,
    );
  }
  if (selected.kind === "template") {
    const template = selected.template;
    if (template === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_RESOLUTION_INVALID", "Template partial file has no template");
    }
    return environment.renderTemplate(template, contextValue, scope.site, context.overrides, scope.state);
  }
  throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_RESOLUTION_INVALID", "Template partial resolution is invalid");
};

export const callTemplateFunctionFamily = (
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  const env = context.environment;
  if (name === "templates.defer" && args.length === 1 && args[0] instanceof DictValue) {
    const options = (args[0] as DictValue).value;
    for (const optionName of options.keys()) {
      if (optionName !== "key" && optionName !== "data") {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFER_OPTION_INVALID",
          `templates.Defer does not support option '${optionName}'`,
        );
      }
    }
    const keyValue = options.get("key");
    if (keyValue !== undefined && !(keyValue instanceof StringValue)) {
      throw createTsumoError("TSUMO_TEMPLATE_DEFER_KEY_INVALID", "templates.Defer key must be a string");
    }
    const key = keyValue !== undefined ? (keyValue as StringValue).value : undefined;
    return new DeferredTemplateValue(key, options.get("data") ?? nil);
  }
  if (name === "partial" && args.length >= 1) {
    const nameArg = toPlainString(args[0]!);
    const ctx = args.length >= 2 ? args[1]! : scope.dot;
    const selected = env.resolvePartialTemplate(nameArg, scope.templateSourcePath, context.defines);
    if (selected === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_MISSING", `Template partial '${nameArg}' was not found`);
    }

    try {
      const rendered = renderPartialResolution(selected, ctx, context);
      return new HtmlValue(new HtmlString(rendered));
    } catch (e) {
      if (e instanceof TemplateReturnSignal) return e.value;
      throw e;
    }
  }

  if (name === "partialcached" && args.length >= 1) {
    const nameArg = toPlainString(args[0]!);
    const ctx = args.length >= 2 ? args[1]! : scope.dot;
    const selected = env.resolvePartialTemplate(nameArg, scope.templateSourcePath, context.defines);
    if (selected === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_MISSING", `Template partial '${nameArg}' was not found`);
    }

    try {
      const rendered = renderPartialResolution(selected, ctx, context);
      return new HtmlValue(new HtmlString(rendered));
    } catch (e) {
      if (e instanceof TemplateReturnSignal) return e.value;
      throw e;
    }
  }

  if (name === "unmarshal") return unmarshalTemplateData(args);

  // templates.Exists - check if a template exists
  if (name === "templates.exists" && args.length >= 1) {
    const templatePath = toPlainString(args[0]!);
    const tpl = env.getTemplate(templatePath);
    return new BoolValue(tpl !== undefined);
  }

  if (name === "errorf" && args.length >= 1) {
    const format = toPlainString(args[0]!);
    let message = format;
    for (let index = 1; index < args.length; index++) {
      message = message.replaceAll("%s", toPlainString(args[index]!));
      message = message.replaceAll("%v", toPlainString(args[index]!));
      message = message.replaceAll("%d", toPlainString(args[index]!));
    }
    throw createTsumoError("TSUMO_TEMPLATE_ERRORF", message);
  }

  if (name === "warnf" && args.length >= 1) {
    const format = toPlainString(args[0]!);
    let message = format;
    for (let i = 1; i < args.length; i++) {
      message = message.replaceAll("%s", toPlainString(args[i]!));
      message = message.replaceAll("%v", toPlainString(args[i]!));
      message = message.replaceAll("%d", toPlainString(args[i]!));
    }
    Console.Error.WriteLine("WARN: {0}", message);
    return nil;
  }

  if (name === "safehtml" && args.length >= 1) {
    const v = args[0]!;
    if (v instanceof HtmlValue) return v;
    return new HtmlValue(new HtmlString(toPlainString(v)));
  }

  if (name === "safehtmlattr" && args.length >= 1) {
    const v = args[0]!;
    if (v instanceof HtmlValue) return v;
    return new HtmlValue(new HtmlString(toPlainString(v)));
  }

  if (name === "safejs" && args.length >= 1) {
    const v = args[0]!;
    return new HtmlValue(new HtmlString(toPlainString(v)));
  }

  if (name === "safeurl" && args.length >= 1) {
    const v = args[0]!;
    return new HtmlValue(new HtmlString(escapeHtml(toPlainString(v))));
  }

  if (name === "safecss" && args.length >= 1) {
    const v = args[0]!;
    return new HtmlValue(new HtmlString(toPlainString(v)));
  }

  if (name === "htmlescape" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(escapeHtml(toPlainString(v)));
  }

  if (name === "htmlunescape" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(WebUtility.HtmlDecode(toPlainString(v)) ?? "");
  }

  if (name === "time.format" && args.length >= 2) {
    const layout = toPlainString(args[0]!);
    const input = toPlainString(args[1]!);
    return new StringValue(formatDateTime(input, layout) ?? "");
  }

  if (name === "path.base" && args.length >= 1) {
    const raw = toPlainString(args[0]!);
    const normalized = trimEndCharacter(replaceText(raw, "\\", "/"), "/");
    if (normalized === "") return new StringValue("");
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? new StringValue(substringFrom(normalized, idx + 1)) : new StringValue(normalized);
  }

  if (name === "path.ext" && args.length >= 1) {
    return new StringValue(getPathExtension(toPlainString(args[0]!)));
  }

  if (name === "path.join" && args.length >= 1) {
    const segments: string[] = [];
    let rooted = false;
    for (let argumentIndex = 0; argumentIndex < args.length; argumentIndex++) {
      const value = replaceText(toPlainString(args[argumentIndex]!), "\\", "/");
      if (argumentIndex === 0 && value.startsWith("/")) rooted = true;
      const parts = value.split("/");
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]!;
        if (part === "" || part === ".") continue;
        if (part === "..") {
          if (segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
          else if (!rooted) segments.push(part);
          continue;
        }
        segments.push(part);
      }
    }
    const joined = segments.join("/");
    return new StringValue(rooted ? "/" + joined : joined === "" ? "." : joined);
  }

  if (name === "title" && args.length >= 1) {
    return new StringValue(toTitleCase(toPlainString(args[0]!)));
  }
  return undefined;
};
