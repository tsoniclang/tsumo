import { Buffer } from "node:buffer";
import { createTsumoError } from "../../diagnostics.js";
import { JavaScriptBuildOptions, Resource, ResourceData } from "../../resources.js";
import type { ResourceManager } from "../../resources.js";
import { readResourceText } from "../../resources/text.js";
import {
  AnyArrayValue, BoolValue, DictValue, ResourceValue, StringValue, TemplateValue,
} from "../values.js";
import { nil, toPlainString } from "../runtime-helpers.js";
import { toJson } from "../evaluation/serialization.js";
import { TemplateFunctionContext } from "./function-context.js";

const resourceBuildOption = (options: DictValue, name: string): TemplateValue | undefined => {
  const exact = options.value.get(name);
  if (exact !== undefined) return exact;
  const normalized = name.toLowerCase();
  for (const key of options.value.keys()) {
    if (key.toLowerCase() !== normalized) continue;
    return options.value.get(key);
  }
  return undefined;
};

const validateCssBuildOptions = (options: DictValue): void => {
  for (const key of options.value.keys()) {
    const normalized = key.toLowerCase();
    if (normalized === "targetpath" || normalized === "minify" || normalized === "sourcemap") continue;
    throw createTsumoError(
      "TSUMO_TEMPLATE_CSS_BUILD_OPTION_UNKNOWN",
      `css.Build does not support option '${key}'`,
    );
  }
};

const buildCssResource = (
  manager: ResourceManager,
  source: Resource,
  options: DictValue,
): ResourceValue => {
  validateCssBuildOptions(options);
  const sourceMap = resourceBuildOption(options, "sourceMap");
  if (sourceMap !== undefined && toPlainString(sourceMap).trim().toLowerCase() !== "none") {
    throw createTsumoError(
      "TSUMO_TEMPLATE_CSS_BUILD_SOURCE_MAP_UNSUPPORTED",
      "css.Build supports only sourceMap 'none'",
    );
  }

  let result = source;
  const targetPath = resourceBuildOption(options, "targetPath");
  if (targetPath !== undefined && toPlainString(targetPath).trim() !== "") {
    result = manager.copy(toPlainString(targetPath), result);
  }
  const minify = resourceBuildOption(options, "minify");
  if (minify instanceof BoolValue) {
    if (minify.value) result = manager.minify(result);
  } else if (minify !== undefined) {
    throw createTsumoError("TSUMO_TEMPLATE_CSS_BUILD_MINIFY_INVALID", "css.Build minify must be a boolean");
  }
  return new ResourceValue(manager, result);
};

const javascriptOptionIsOneOf = (value: string, accepted: string[]): boolean => {
  for (let index = 0; index < accepted.length; index++) {
    if (value === accepted[index]!) return true;
  }
  return false;
};

const serializeJavaScriptBuildParams = (value: TemplateValue): string => {
  if (value instanceof DictValue) return toJson(value);
  if (value instanceof AnyArrayValue) return toJson(value);
  throw createTsumoError(
    "TSUMO_TEMPLATE_JAVASCRIPT_BUILD_PARAMS_INVALID",
    "js.Build params must be a dictionary or slice",
  );
};

const parseJavaScriptBuildOptionDictionary = (value: DictValue): JavaScriptBuildOptions => {
  const options = new JavaScriptBuildOptions();
  for (const key of value.value.keys()) {
    const normalized = key.toLowerCase();
    if (
      normalized === "targetpath" ||
      normalized === "minify" ||
      normalized === "format" ||
      normalized === "target" ||
      normalized === "platform" ||
      normalized === "sourcemap" ||
      normalized === "params" ||
      normalized === "jsxfactory"
    ) continue;
    throw createTsumoError(
      "TSUMO_TEMPLATE_JAVASCRIPT_BUILD_OPTION_UNKNOWN",
      `js.Build does not support option '${key}'`,
    );
  }

  const targetPath = resourceBuildOption(value, "targetPath");
  if (targetPath !== undefined) options.targetPath = toPlainString(targetPath);

  const minify = resourceBuildOption(value, "minify");
  if (minify !== undefined) {
    if (!(minify instanceof BoolValue)) {
      throw createTsumoError("TSUMO_TEMPLATE_JAVASCRIPT_BUILD_MINIFY_INVALID", "js.Build minify must be a boolean");
    }
    options.minify = minify.value;
  }

  const format = resourceBuildOption(value, "format");
  if (format !== undefined) {
    const selected = toPlainString(format).trim().toLowerCase();
    if (!javascriptOptionIsOneOf(selected, ["iife", "cjs", "esm"])) {
      throw createTsumoError("TSUMO_TEMPLATE_JAVASCRIPT_BUILD_FORMAT_INVALID", `js.Build format '${selected}' is invalid`);
    }
    options.format = selected;
  }

  const target = resourceBuildOption(value, "target");
  if (target !== undefined) {
    const selected = toPlainString(target).trim().toLowerCase();
    if (!javascriptOptionIsOneOf(selected, [
      "es5", "es2015", "es2016", "es2017", "es2018", "es2019", "es2020",
      "es2021", "es2022", "es2023", "es2024", "esnext",
    ])) {
      throw createTsumoError("TSUMO_TEMPLATE_JAVASCRIPT_BUILD_TARGET_INVALID", `js.Build target '${selected}' is invalid`);
    }
    options.target = selected;
  }

  const platform = resourceBuildOption(value, "platform");
  if (platform !== undefined) {
    const selected = toPlainString(platform).trim().toLowerCase();
    if (!javascriptOptionIsOneOf(selected, ["browser", "node", "neutral"])) {
      throw createTsumoError("TSUMO_TEMPLATE_JAVASCRIPT_BUILD_PLATFORM_INVALID", `js.Build platform '${selected}' is invalid`);
    }
    options.platform = selected;
  }

  const sourceMap = resourceBuildOption(value, "sourceMap");
  if (sourceMap !== undefined) options.sourceMap = toPlainString(sourceMap).trim().toLowerCase();

  const params = resourceBuildOption(value, "params");
  if (params !== undefined) options.paramsJson = serializeJavaScriptBuildParams(params);

  const jsxFactory = resourceBuildOption(value, "JSXFactory");
  if (jsxFactory !== undefined) options.jsxFactory = toPlainString(jsxFactory).trim();
  return options;
};

const parseJavaScriptBuildOptions = (value: TemplateValue): JavaScriptBuildOptions => {
  if (value instanceof StringValue) {
    const options = new JavaScriptBuildOptions();
    options.targetPath = value.value;
    return options;
  }
  if (value instanceof DictValue) {
    return parseJavaScriptBuildOptionDictionary(value as DictValue);
  }
  throw createTsumoError(
    "TSUMO_TEMPLATE_JAVASCRIPT_BUILD_OPTIONS_INVALID",
    "js.Build options must be a dictionary or target path string",
  );
};

export const callResourceFunction = (
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  const env = context.environment;
  const overrides = context.overrides;
  if (name === "resources.get" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const path = toPlainString(args[0]!);
    const res = mgr.get(path);
    return res !== undefined ? new ResourceValue(mgr, res) : nil;
  }

  if (name === "resources.getmatch" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const pattern = toPlainString(args[0]!);
    const res = mgr.getMatch(pattern);
    return res !== undefined ? new ResourceValue(mgr, res) : nil;
  }

  // resources.Match - get all matching resources (returns array)
  if (name === "resources.match" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) {
      const emptyItems: TemplateValue[] = [];
      return new AnyArrayValue(emptyItems);
    }
    const pattern = toPlainString(args[0]!);
    const resources = mgr.match(pattern);
    const result: TemplateValue[] = [];
    for (let i = 0; i < resources.length; i++) {
      result.push(new ResourceValue(mgr, resources[i]!));
    }
    return new AnyArrayValue(result);
  }

  // resources.ByType - get all resources of a given media type
  if (name === "resources.bytype" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) {
      const emptyItems: TemplateValue[] = [];
      return new AnyArrayValue(emptyItems);
    }
    const mediaType = toPlainString(args[0]!);
    const resources = mgr.byType(mediaType);
    const result: TemplateValue[] = [];
    for (let i = 0; i < resources.length; i++) {
      result.push(new ResourceValue(mgr, resources[i]!));
    }
    return new AnyArrayValue(result);
  }

  // resources.Concat - concatenate resources into one
  if (name === "resources.concat" && args.length >= 2) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const targetPath = toPlainString(args[0]!);
    const input = args[args.length - 1]!;
    // Input can be an array of resources (piped from slice or Match)
    const resources: Resource[] = [];
    if (input instanceof AnyArrayValue) {
      const arr = input.value;
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i]!;
        if (item instanceof ResourceValue) {
          resources.push((item as ResourceValue).value);
        }
      }
    } else if (input instanceof ResourceValue) {
      resources.push((input as ResourceValue).value);
    }
    if (resources.length === 0) return nil;
    const res = mgr.concat(targetPath, resources);
    return new ResourceValue(mgr, res);
  }

  if (name === "resources.fromstring" && args.length >= 2) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const nameArg = toPlainString(args[0]!);
    const content = toPlainString(args[1]!);
    const res = mgr.fromString(nameArg, content);
    return new ResourceValue(mgr, res);
  }

  if (name === "resources.executeastemplate" && args.length >= 2) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const piped = args.length >= 3 ? args[args.length - 1]! : nil;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const targetName = toPlainString(args[0]!);
    const ctx = args[1]!;
    const templateText = readResourceText(src, "resources.ExecuteAsTemplate");
    const rendered = env.renderTextTemplateSource(templateText, ctx, scope.site, overrides);
    const bytes = Buffer.from(rendered, "utf8");
    const lang = scope.site.Language.Lang;
    const id = `${src.id}|executeAsTemplate:${targetName}|lang:${lang}`;
    const out = new Resource(id, src.sourcePath, src.publishable, targetName, bytes, rendered, new ResourceData(""));
    return new ResourceValue(mgr, out);
  }

  if (name === "resources.minify" || name === "minify") {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const piped = args.length >= 1 ? args[args.length - 1]! : nil;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const res = mgr.minify(src);
    return new ResourceValue(mgr, res);
  }

  if ((name === "resources.fingerprint" || name === "fingerprint") && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const piped = args[args.length - 1]!;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const res = mgr.fingerprint(src);
    return new ResourceValue(mgr, res);
  }

  if (name === "resources.copy" && args.length >= 2) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const targetPath = toPlainString(args[0]!);
    const piped = args[args.length - 1]!;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const res = mgr.copy(targetPath, src);
    return new ResourceValue(mgr, res);
  }

  if ((name === "images.resize" || name === "resize") && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;

    // First arg is resize spec, piped resource is last arg
    const spec = args.length >= 2 ? toPlainString(args[0]!) : "";
    const piped = args[args.length - 1]!;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const res = mgr.resize(src, spec);
    return new ResourceValue(mgr, res);
  }

  if (name === "css.sass" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const piped = args[args.length - 1]!;
    const isResource = piped instanceof ResourceValue;
    if (isResource === false) return nil;
    const src = (piped as ResourceValue).value;
    const res = mgr.sassCompile(src);
    return new ResourceValue(mgr, res);
  }

  if (name === "css.build" && args.length >= 1) {
    const mgr = env.getResourceManager();
    if (mgr === undefined) return nil;
    const piped = args[args.length - 1]!;
    if (piped instanceof ResourceValue) {
      if (args.length < 2) return buildCssResource(mgr, piped.value, new DictValue(new Map<string, TemplateValue>()));
      const options = args[0]!;
      if (options instanceof DictValue) return buildCssResource(mgr, piped.value, options as DictValue);
      throw createTsumoError(
        "TSUMO_TEMPLATE_CSS_BUILD_OPTIONS_INVALID",
        "css.Build options must be a dictionary",
      );
    }
    throw createTsumoError("TSUMO_TEMPLATE_CSS_BUILD_INPUT_INVALID", "css.Build requires a CSS resource input");
  }
  if (name === "js.build" && args.length >= 1) {
    const manager = env.getResourceManager();
    if (manager === undefined) return nil;
    const piped = args[args.length - 1]!;
    if (!(piped instanceof ResourceValue)) {
      throw createTsumoError("TSUMO_TEMPLATE_JAVASCRIPT_BUILD_INPUT_INVALID", "js.Build requires a JavaScript resource input");
    }
    if (args.length > 2) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_JAVASCRIPT_BUILD_OPTIONS_INVALID",
        "js.Build accepts at most one options argument",
      );
    }
    const options = args.length === 2 ? parseJavaScriptBuildOptions(args[0]!) : new JavaScriptBuildOptions();
    return new ResourceValue(manager, manager.javascriptBuild(piped.value, options));
  }
  return undefined;
};
