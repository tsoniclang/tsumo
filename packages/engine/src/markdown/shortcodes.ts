import type { int } from "@tsonic/csharp/types.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { parseShortcodes, ShortcodeCall } from "../shortcode.js";
import { ShortcodeContext, ShortcodeValue } from "../template/contexts.js";
import { RenderScope } from "../template/scope.js";
import { TemplateEnvironment } from "../template/environment.js";
import { TemplateNode } from "../template/nodes.js";
import { PageValue } from "../template/values.js";
import { PageContext, SiteContext } from "../models.js";
import { substringCount, substringFrom } from "../utils/strings.js";

// Shortcode execution ordinal tracker
export class ShortcodeOrdinalTracker {
  counts: Map<string, int>;

  constructor() {
    this.counts = new Map<string, int>();
  }

  next(name: string): int {
    const count = this.counts.get(name);
    const nextVal = (count !== undefined ? count + 1 : 0) as int;
    this.counts.set(name, nextVal);
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
  recursionGuard: Map<string, boolean>,
): string => {
  const template = env.getShortcodeTemplate(call.name);
  if (template === undefined) {
    // Return raw shortcode text if no template found
    return "";
  }

  // Check recursion guard
  const guardKey = call.name;
  const isRecursing = recursionGuard.get(guardKey);
  if (isRecursing !== undefined && isRecursing) {
    return `<!-- shortcode recursion detected: ${call.name} -->`;
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

  const sb = new StringBuilder();
  const pageValue = new PageValue(page);
  const shortcodeValue = new ShortcodeValue(ctx);
  const scope = new RenderScope(shortcodeValue, shortcodeValue, site, env, undefined);
  const emptyOverrides = new Map<string, TemplateNode[]>();

  template.renderInto(sb, scope, env, emptyOverrides);

  recursionGuard.set(guardKey, false);

  return sb.ToString();
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
  const calls = parseShortcodes(text);
  if (calls.length === 0) return text;

  // Sort by startIndex descending to process from end to beginning
  const arr: ShortcodeCall[] = [];
  for (let i = 0; i < calls.length; i++) arr.push(calls[i]!);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j]!.startIndex > arr[i]!.startIndex) {
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
    }
  }

  let result = text;
  for (let i = 0; i < arr.length; i++) {
    const call = arr[i]!;

    // Skip comment shortcodes ({{</* ... */>}} or {{%/* ... */%}})
    // These are handled by parseShortcodes skipping them already

    const replacement = executeShortcode(call, page, site, env, ordinalTracker, parent, recursionGuard);
    result = substringCount(result, 0, call.startIndex) + replacement + substringFrom(result, call.endIndex);
  }

  return result;
};

export const createOrdinalTracker = (): ShortcodeOrdinalTracker => new ShortcodeOrdinalTracker();
