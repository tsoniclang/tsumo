import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { parseShortcodes, ShortcodeCall } from "../shortcode.js";
import { ShortcodeContext, ShortcodeValue } from "../template/contexts.js";
import type { TemplateEnvironment } from "../template/environment.js";
import type { TemplateNode } from "../template/nodes.js";
import { PageContext, SiteContext } from "../models.js";
import { substringCount, substringFrom } from "../utils/strings.js";

// Shortcode execution ordinal tracker
export class ShortcodeOrdinalTracker {
  counts: Map<string, int32>;

  constructor() {
    this.counts = new Map<string, int32>();
  }

  next(name: string): int32 {
    const count = this.counts.get(name);
    const nextVal = (count !== undefined ? count + 1 : 0) as int32;
    this.counts.set(name, nextVal);
    return nextVal;
  }
}

export const renderShortcode = (
  call: ShortcodeCall,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Map<string, boolean>,
): string => {
  const template = env.getShortcodeTemplate(call.name);
  if (template === undefined) {
    throw createTsumoError("TSUMO_SHORTCODE_TEMPLATE_MISSING", `Shortcode template not found: ${call.name}`, call.sourcePath ?? page.File?.Filename, call.line, call.column);
  }

  // Check recursion guard
  const guardKey = call.name;
  const isRecursing = recursionGuard.get(guardKey);
  if (isRecursing !== undefined && isRecursing) {
    throw createTsumoError("TSUMO_SHORTCODE_RECURSION", `Shortcode recursion detected: ${call.name}`, call.sourcePath ?? page.File?.Filename, call.line, call.column);
  }

  recursionGuard.set(guardKey, true);

  const ordinal = ordinalTracker.next(call.name);

  // Process inner content recursively for nested shortcodes
  let processedInner = call.inner;
  if (call.inner !== "") {
    processedInner = processShortcodes(call.inner, page, site, env, ordinalTracker, undefined, recursionGuard);
  }

  const ctx = new ShortcodeContext(
    call.name,
    page,
    site,
    call.params,
    call.positionalParams,
    call.isNamedParams,
    processedInner,
    ordinal,
    parent,
  );

  const shortcodeValue = new ShortcodeValue(ctx);
  const emptyOverrides = new Map<string, TemplateNode[]>();
  const result = env.renderTemplate(template, shortcodeValue, site, emptyOverrides);

  recursionGuard.set(guardKey, false);

  return result;
};

export const processShortcodes = (
  text: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Map<string, boolean>,
): string => {
  const calls = parseShortcodes(text, page.File?.Filename);
  if (calls.length === 0) return text;

  return processShortcodeCalls(text, calls, page, site, env, ordinalTracker, parent, recursionGuard);
};

export const processShortcodeCalls = (
  text: string,
  calls: readonly ShortcodeCall[],
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Map<string, boolean>,
): string => {
  const replacements: string[] = [];
  for (let i = 0; i < calls.length; i++) {
    replacements.push(renderShortcode(calls[i]!, page, site, env, ordinalTracker, parent, recursionGuard));
  }

  let result = text;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    result = substringCount(result, 0, call.startIndex) + replacements[i]! + substringFrom(result, call.endIndex);
  }

  return result;
};

export const createOrdinalTracker = (): ShortcodeOrdinalTracker => new ShortcodeOrdinalTracker();
