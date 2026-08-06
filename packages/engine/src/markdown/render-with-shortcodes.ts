import { Markdown } from "@tsonic/dotnet/Markdig.js";
import { parseShortcodes, ShortcodeCall } from "../shortcode.js";
import { TemplateEnvironment } from "../template/environment.js";
import { PageContext, SiteContext } from "../models.js";
import { MarkdownResult } from "./result.js";
import { markdownPipeline } from "./pipeline.js";
import { generateTableOfContents } from "./toc.js";
import { RenderHookContext, renderMarkdownWithHooks } from "./render-hooks.js";
import { createOrdinalTracker, processShortcodeCalls, renderShortcode } from "./shortcodes.js";
import { normalizeNewlines, findSummaryDividerIndex, summaryMarkerLength, firstBlock } from "./render-basic.js";
import { substringCount, substringFrom } from "../utils/strings.js";

class ProtectedShortcode {
  marker: string;
  output: string;

  constructor(marker: string, output: string) {
    this.marker = marker;
    this.output = output;
  }
}

class ProtectedShortcodeSource {
  source: string;
  replacements: ProtectedShortcode[];

  constructor(source: string, replacements: ProtectedShortcode[]) {
    this.source = source;
    this.replacements = replacements;
  }
}

const protectStandardShortcodes = (
  text: string,
  calls: readonly ShortcodeCall[],
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ReturnType<typeof createOrdinalTracker>,
  recursionGuard: Map<string, boolean>,
): ProtectedShortcodeSource => {
  const outputs: string[] = [];
  for (let i = 0; i < calls.length; i++) {
    outputs.push(renderShortcode(calls[i]!, page, site, env, ordinalTracker, undefined, recursionGuard));
  }

  let markerPrefix = "tsumo-shortcode-output";
  let markerPrefixTaken = true;
  while (markerPrefixTaken) {
    markerPrefixTaken = text.includes(`<!--${markerPrefix}-`);
    for (let i = 0; i < outputs.length && !markerPrefixTaken; i++) {
      markerPrefixTaken = outputs[i]!.includes(`<!--${markerPrefix}-`);
    }
    if (markerPrefixTaken) markerPrefix += "-x";
  }

  const replacements: ProtectedShortcode[] = [];
  for (let i = 0; i < calls.length; i++) {
    replacements.push(new ProtectedShortcode(`<!--${markerPrefix}-${i}-->`, outputs[i]!));
  }

  let source = text;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    source = substringCount(source, 0, call.startIndex) + replacements[i]!.marker + substringFrom(source, call.endIndex);
  }

  return new ProtectedShortcodeSource(source, replacements);
};

const restoreStandardShortcodes = (html: string, replacements: readonly ProtectedShortcode[]): string => {
  let result = html;
  for (let i = 0; i < replacements.length; i++) {
    const replacement = replacements[i]!;
    result = result.replace(replacement.marker, replacement.output);
  }
  return result;
};

export const renderMarkdownWithShortcodes = (
  markdownRaw: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const ordinalTracker = createOrdinalTracker();
  const recursionGuard = new Map<string, boolean>();

  // Step 1: Process markdown-notation shortcodes ({{% ... %}}) BEFORE markdown rendering
  const calls = parseShortcodes(markdown, page.File?.Filename);
  let textAfterMarkdownShortcodes = markdown;

  // Filter markdown-notation shortcodes and process them first
  const mdCalls: ShortcodeCall[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    if (call.isMarkdown) mdCalls.push(call);
  }

  if (mdCalls.length > 0) {
    textAfterMarkdownShortcodes = processShortcodeCalls(
      markdown,
      mdCalls,
      page,
      site,
      env,
      ordinalTracker,
      undefined,
      recursionGuard,
    );
  }

  const parsedStandardCalls = parseShortcodes(textAfterMarkdownShortcodes, page.File?.Filename);
  const standardCalls: ShortcodeCall[] = [];
  for (let i = 0; i < parsedStandardCalls.length; i++) {
    const call = parsedStandardCalls[i]!;
    if (!call.isMarkdown) standardCalls.push(call);
  }
  const protectedStandard = protectStandardShortcodes(
    textAfterMarkdownShortcodes,
    standardCalls,
    page,
    site,
    env,
    ordinalTracker,
    recursionGuard,
  );
  const markdownSource = protectedStandard.source;

  // Step 2: Generate TOC from text after markdown shortcodes (but before standard shortcodes)
  const toc = generateTableOfContents(markdownSource);

  // Step 3: Create render hook context
  const hookCtx = new RenderHookContext(page, site, env);

  // Step 4: Render markdown with hooks (proper Markdig renderer extension approach)
  const moreIndex = findSummaryDividerIndex(markdownSource);
  let html: string;
  let summaryHtml: string;
  let plainText: string;

  if (moreIndex >= 0) {
    const before = substringCount(markdownSource, 0, moreIndex);
    const after = substringFrom(markdownSource, moreIndex + summaryMarkerLength);
    const full = before + after;
    // Use hook-aware rendering if hooks are present, otherwise use standard rendering
    if (hookCtx.hasAnyHooks()) {
      html = renderMarkdownWithHooks(full, hookCtx);
      summaryHtml = renderMarkdownWithHooks(before, hookCtx).trim();
    } else {
      html = Markdown.ToHtml(full, markdownPipeline);
      summaryHtml = Markdown.ToHtml(before, markdownPipeline).trim();
    }
    plainText = Markdown.ToPlainText(full, markdownPipeline);
  } else {
    if (hookCtx.hasAnyHooks()) {
      html = renderMarkdownWithHooks(markdownSource, hookCtx);
    } else {
      html = Markdown.ToHtml(markdownSource, markdownPipeline);
    }
    plainText = Markdown.ToPlainText(markdownSource, markdownPipeline);
    const summarySource = firstBlock(markdownSource);
    if (summarySource === "") {
      summaryHtml = "";
    } else if (hookCtx.hasAnyHooks()) {
      summaryHtml = renderMarkdownWithHooks(summarySource, hookCtx).trim();
    } else {
      summaryHtml = Markdown.ToHtml(summarySource, markdownPipeline).trim();
    }
  }

  // Step 5: Restore standard-notation shortcode output without Markdown processing.
  html = restoreStandardShortcodes(html, protectedStandard.replacements);
  summaryHtml = restoreStandardShortcodes(summaryHtml, protectedStandard.replacements);

  return new MarkdownResult(html, summaryHtml, plainText, toc);
};
