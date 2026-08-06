import { Console } from "@tsonic/dotnet/System.js";
import { WebUtility } from "@tsonic/dotnet/System.Net.js";
import { createTsumoError } from "../../diagnostics.js";
import { HtmlString, escapeHtml } from "../../utils/html.js";
import { replaceText, substringFrom } from "../../utils/strings.js";
import {
  BoolValue, HtmlValue, StringValue, TemplateValue,
} from "../values.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { toTitleCase } from "../evaluation/page-semantics.js";
import { convertGoDateLayoutToDotNet, parseDateTime } from "../evaluation/scalar-semantics.js";
import { trimEndCharacter } from "../evaluation/serialization.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";

export const callTemplateFunctionFamily = (
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  const env = context.environment;
  const overrides = context.overrides;
  if (name === "partial" && args.length >= 1) {
    const nameArg = toPlainString(args[0]!);
    const ctx = args.length >= 2 ? args[1]! : scope.dot;
    const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
    if (tpl === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_MISSING", `Template partial '${nameArg}' was not found`);
    }

    try {
      return new HtmlValue(new HtmlString(env.renderTemplate(tpl, ctx, scope.site, overrides)));
    } catch (e) {
      if (e instanceof TemplateReturnSignal) return e.value;
      throw e;
    }
  }

  if (name === "partialcached" && args.length >= 1) {
    const nameArg = toPlainString(args[0]!);
    const ctx = args.length >= 2 ? args[1]! : scope.dot;
    const tpl = env.getTemplate(`partials/${nameArg}`) ?? env.getTemplate(`_partials/${nameArg}`);
    if (tpl === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_MISSING", `Template partial '${nameArg}' was not found`);
    }

    try {
      return new HtmlValue(new HtmlString(env.renderTemplate(tpl, ctx, scope.site, overrides)));
    } catch (e) {
      if (e instanceof TemplateReturnSignal) return e.value;
      throw e;
    }
  }

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
    const parsed = parseDateTime(input);
    if (parsed === undefined) return new StringValue("");
    const fmt = convertGoDateLayoutToDotNet(layout);
    return new StringValue(parsed.ToString(fmt));
  }

  if (name === "path.base" && args.length >= 1) {
    const raw = toPlainString(args[0]!);
    const normalized = trimEndCharacter(replaceText(raw, "\\", "/"), "/");
    if (normalized === "") return new StringValue("");
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? new StringValue(substringFrom(normalized, idx + 1)) : new StringValue(normalized);
  }

  if (name === "title" && args.length >= 1) {
    return new StringValue(toTitleCase(toPlainString(args[0]!)));
  }
  return undefined;
};
