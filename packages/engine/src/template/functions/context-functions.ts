import { Environment } from "@tsonic/dotnet/System.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { HtmlString } from "../../utils/html.js";
import { substringCount, substringFrom } from "../../utils/strings.js";
import { parseInt32, toInt32 } from "../../utils/int32.js";
import {
  BoolValue, DictValue, HtmlValue, NumberValue, StringValue, TemplateValue, VersionStringValue,
} from "../values.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { callMethod, evalToken } from "../evaluation/expression-semantics.js";
import { formatDateTime } from "../evaluation/scalar-semantics.js";
import { getSiteStore } from "../evaluation/property-support.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";

const hugoCompatibilityVersion = "0.146.2";

export const callContextFunction = (
  nameRaw: string,
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  const env = context.environment;
  const overrides = context.overrides;
  if (name === "site.store.get" && args.length >= 1) {
    const store = getSiteStore(scope.site);
    return store.get(toPlainString(args[0]!));
  }
  if (name === "site.store.set" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.set(toPlainString(args[0]!), args[1]!);
    return nil;
  }
  if (name === "site.store.add" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.add(toPlainString(args[0]!), args[1]!);
    return nil;
  }
  if (name === "site.store.delete" && args.length >= 1) {
    const store = getSiteStore(scope.site);
    store.delete(toPlainString(args[0]!));
    return nil;
  }
  if (name === "site.store.setinmap" && args.length >= 3) {
    const store = getSiteStore(scope.site);
    const mapName = toPlainString(args[0]!);
    const key = toPlainString(args[1]!);
    const value = args[2]!;
    store.setInMap(mapName, key, value);
    return nil;
  }
  if (name === "site.store.deleteinmap" && args.length >= 2) {
    const store = getSiteStore(scope.site);
    store.deleteInMap(toPlainString(args[0]!), toPlainString(args[1]!));
    return nil;
  }

  const trimmedName = nameRaw.trim();
  const lastDot = trimmedName.lastIndexOf(".");
  const lowerName = trimmedName.toLowerCase();
  const startsWithDot = trimmedName.startsWith(".");
  const startsWithDollar = trimmedName.startsWith("$");
  const startsWithSite = lowerName.startsWith("site.");
  const startsWithPage = lowerName.startsWith("page.");
  const startsWithHugoStore = lowerName.startsWith("hugo.store.");

  let receiverToken: string | undefined = undefined;
  let methodName: string | undefined = undefined;
  if (lastDot > 0) {
    if (startsWithDot || startsWithDollar || startsWithSite || startsWithPage || startsWithHugoStore) {
      receiverToken = substringCount(trimmedName, 0, lastDot);
      methodName = substringFrom(trimmedName, lastDot + 1).trim();
    }
  } else if (startsWithDot && lastDot === 0) {
    receiverToken = ".";
    methodName = substringFrom(trimmedName, 1).trim();
  }

  if (receiverToken !== undefined && methodName !== undefined && methodName.trim() !== "") {
    const receiverValue = evalToken(receiverToken, scope);
    return callMethod(receiverValue, methodName, args, scope, env, overrides, context.defines);
  }

  if (name === "return") {
    const v = args.length >= 1 ? args[0]! : nil;
    throw new TemplateReturnSignal(v);
  }

  if (name === "hugo.ismultilingual") return new BoolValue(false);
  if (name === "hugo.ismultihost") return new BoolValue(false);
  if (name === "hugo.workingdir") return new StringValue(Environment.CurrentDirectory);
  if (name === "hugo.version") return new VersionStringValue(hugoCompatibilityVersion);
  if (name === "hugo.generator") {
    return new HtmlValue(new HtmlString(`<meta name="generator" content="Hugo ${hugoCompatibilityVersion}">`));
  }
  // hugo.IsProduction returns true for production builds (default: true)
  if (name === "hugo.isproduction") return new BoolValue(env.isProduction);
  // hugo.IsExtended returns true if extended features (Sass, image processing) are available
  if (name === "hugo.isextended") return new BoolValue(true);
  // hugo.IsServer returns true during hugo server (dev mode)
  if (name === "hugo.isserver") return new BoolValue(!env.isProduction);
  // hugo.IsDevelopment returns true in development mode
  if (name === "hugo.isdevelopment") return new BoolValue(!env.isProduction);
  if (name === "hugo.environment") return new StringValue(env.isProduction ? "production" : "development");
  if (name === "now.year") {
    const year = parseInt32(substringCount(env.buildTime.toISOString(), 0, 4));
    return new NumberValue(year ?? 0);
  }
  if (name === "now.format" && args.length >= 1) {
    const rendered = formatDateTime(env.buildTime.toISOString(), toPlainString(args[0]!));
    return rendered !== undefined ? new StringValue(rendered) : nil;
  }
  if (name === "now.unix") {
    const buildMilliseconds: number = env.buildTime.getTime();
    const unixSeconds: number = Math.floor(buildMilliseconds / 1000);
    const seconds = toInt32(unixSeconds);
    if (seconds === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_TIME_RANGE_UNSUPPORTED", "now.Unix is outside the template integer range");
    }
    return new NumberValue(seconds);
  }
  if (name === "now.unixnano") {
    const buildMilliseconds: number = env.buildTime.getTime();
    const milliseconds: number = Math.floor(buildMilliseconds);
    if (!Number.isSafeInteger(milliseconds)) {
      throw createTsumoError("TSUMO_TEMPLATE_TIME_RANGE_UNSUPPORTED", "now.UnixNano requires an exact millisecond timestamp");
    }
    return new StringValue(`${milliseconds}000000`);
  }
  if (name === "getenv" && args.length >= 1) {
    const value = env.getEnvironmentVariable(toPlainString(args[0]!));
    return value !== undefined ? new StringValue(value) : new StringValue("");
  }
  if (name === "fileexists" && args.length >= 1) {
    return new BoolValue(env.sourceFileExists(toPlainString(args[0]!)));
  }

  if (name === "i18n" && args.length >= 1) {
    const key = toPlainString(args[0]!);
    const lang = scope.site.Language.Lang;
    const argument = args.length >= 2 ? args[1]! : nil;
    let count: int32 | undefined = undefined;
    let renderContext = argument;
    if (argument instanceof NumberValue) {
      count = argument.value;
      const fields = new Map<string, TemplateValue>();
      fields.set("Count", argument);
      renderContext = new DictValue(fields);
    } else if (argument instanceof DictValue) {
      for (const field of argument.value.keys()) {
        if (field.toLowerCase() !== "count") continue;
        const value = argument.value.get(field);
        if (value instanceof NumberValue) count = value.value;
        break;
      }
    }
    const translated = env.getI18n(lang, key, count);
    if (translated === key) return new StringValue(key);
    return new StringValue(env.renderTextTemplateSource(translated, renderContext, scope.site, overrides, scope.state));
  }
  return undefined;
};
