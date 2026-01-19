import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import { parseShortcodes, ShortcodeCall } from "../shortcode.ts";
import { ShortcodeContext, ShortcodeValue, RenderScope, TemplateEnvironment, TemplateNode, PageValue } from "../template/index.ts";
import { PageContext, SiteContext } from "../models.ts";

// Shortcode execution ordinal tracker
export class ShortcodeOrdinalTracker {
  private readonly counts: Dictionary<string, int>;

  constructor() {
    this.counts = new Dictionary<string, int>();
  }

  next(name: string): int {
    let count: int = 0;
    const has = this.counts.TryGetValue(name, count);
    const nextVal = has ? count + 1 : 0;
    this.counts.Remove(name);
    this.counts.Add(name, nextVal);
    return nextVal;
  }
}

const executeShortcode = (
  call: ShortcodeCall,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Dictionary<string, boolean>,
): string => {
  const template = env.getShortcodeTemplate(call.name);
  if (template === undefined) {
    // Return raw shortcode text if no template found
    return "";
  }

  // Check recursion guard
  const guardKey = call.name;
  let isRecursing: boolean = false;
  const hasGuard = recursionGuard.TryGetValue(guardKey, isRecursing);
  if (hasGuard && isRecursing) {
    return `<!-- shortcode recursion detected: ${call.name} -->`;
  }

  recursionGuard.Remove(guardKey);
  recursionGuard.Add(guardKey, true);

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

  const sb = new StringBuilder();
  const pageValue = new PageValue(page);
  const shortcodeValue = new ShortcodeValue(ctx);
  const scope = new RenderScope(shortcodeValue, shortcodeValue, site, env, undefined);
  const emptyOverrides = new Dictionary<string, TemplateNode[]>();

  template.renderInto(sb, scope, env, emptyOverrides);

  recursionGuard.Remove(guardKey);
  recursionGuard.Add(guardKey, false);

  return sb.ToString();
};

export const processShortcodes = (
  text: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Dictionary<string, boolean>,
): string => {
  const calls = parseShortcodes(text);
  if (calls.Length === 0) return text;

  // Sort by startIndex descending to process from end to beginning
  const sorted = new List<ShortcodeCall>();
  for (let i = 0; i < calls.Length; i++) sorted.Add(calls[i]!);

  // Simple bubble sort by startIndex descending
  const arr = sorted.ToArray();
  for (let i = 0; i < arr.Length; i++) {
    for (let j = i + 1; j < arr.Length; j++) {
      if (arr[j]!.startIndex > arr[i]!.startIndex) {
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
    }
  }

  let result = text;
  for (let i = 0; i < arr.Length; i++) {
    const call = arr[i]!;

    // Skip comment shortcodes ({{</* ... */>}} or {{%/* ... */%}})
    // These are handled by parseShortcodes skipping them already

    const replacement = executeShortcode(call, page, site, env, ordinalTracker, parent, recursionGuard);
    result = result.Substring(0, call.startIndex) + replacement + result.Substring(call.endIndex);
  }

  return result;
};

export const createOrdinalTracker = (): ShortcodeOrdinalTracker => new ShortcodeOrdinalTracker();
