import { Markdown } from "@tsumo/markdig/Markdig.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { parseShortcodes, ShortcodeCall } from "../shortcode.ts";
import { ShortcodeContext, ShortcodeValue, RenderScope, TemplateEnvironment, TemplateNode } from "../template/index.ts";
import { PageContext, SiteContext } from "../models.ts";
import { MarkdownResult } from "./result.ts";
import { markdownPipeline } from "./pipeline.ts";
import { generateTableOfContents } from "./toc.ts";
import { RenderHookContext, renderMarkdownWithHooks } from "./render-hooks.ts";
import { processShortcodes, createOrdinalTracker } from "./shortcodes.ts";
import { normalizeNewlines, findSummaryDividerIndex, summaryMarkerLength, firstBlock } from "./render-basic.ts";

export const renderMarkdownWithShortcodes = (
  markdownRaw: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const ordinalTracker = createOrdinalTracker();
  const recursionGuard = new Dictionary<string, boolean>();

  // Step 1: Process markdown-notation shortcodes ({{% ... %}}) BEFORE markdown rendering
  const calls = parseShortcodes(markdown);
  let textAfterMarkdownShortcodes = markdown;

  // Filter markdown-notation shortcodes and process them first
  const mdCalls = new List<ShortcodeCall>();
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;
    if (call.isMarkdown) mdCalls.add(call);
  }

  if (mdCalls.count > 0) {
    // Sort descending by startIndex
    const mdArr = mdCalls.toArray();
    for (let i = 0; i < mdArr.length; i++) {
      for (let j = i + 1; j < mdArr.length; j++) {
        if (mdArr[j]!.startIndex > mdArr[i]!.startIndex) {
          const tmp = mdArr[i]!;
          mdArr[i] = mdArr[j]!;
          mdArr[j] = tmp;
        }
      }
    }

    for (let i = 0; i < mdArr.length; i++) {
      const call = mdArr[i]!;
      const replacement = processShortcodes(
        call.inner !== "" ? call.inner : "",
        page,
        site,
        env,
        ordinalTracker,
        undefined,
        recursionGuard,
      );
      // For markdown shortcodes, we need to execute them directly, not just their inner content
      const template = env.getShortcodeTemplate(call.name);
      if (template !== undefined) {
        const sb = new StringBuilder();
        const ctx = new ShortcodeContext(
          call.name,
          page,
          site,
          call.params,
          call.positionalParams,
          call.isNamedParams,
          replacement,
          0,
          undefined,
        );
        const shortcodeValue = new ShortcodeValue(ctx);
        const scope = new RenderScope(shortcodeValue, shortcodeValue, site, env, undefined);
        const emptyOverrides = new Dictionary<string, TemplateNode[]>();
        template.renderInto(sb, scope, env, emptyOverrides);
        const output = sb.toString();
        textAfterMarkdownShortcodes = textAfterMarkdownShortcodes.substring(0, call.startIndex) + output + textAfterMarkdownShortcodes.substring(call.endIndex);
      }
    }
  }

  // Step 2: Generate TOC from text after markdown shortcodes (but before standard shortcodes)
  const toc = generateTableOfContents(textAfterMarkdownShortcodes);

  // Step 3: Create render hook context
  const hookCtx = new RenderHookContext(page, site, env);

  // Step 4: Render markdown with hooks (proper Markdig renderer extension approach)
  const moreIndex = findSummaryDividerIndex(textAfterMarkdownShortcodes);
  let html: string;
  let summaryHtml: string;
  let plainText: string;

  if (moreIndex >= 0) {
    const before = textAfterMarkdownShortcodes.substring(0, moreIndex);
    const after = textAfterMarkdownShortcodes.substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    // Use hook-aware rendering if hooks are present, otherwise use standard rendering
    if (hookCtx.hasAnyHooks()) {
      html = renderMarkdownWithHooks(full, hookCtx);
      summaryHtml = renderMarkdownWithHooks(before, hookCtx).trim();
    } else {
      html = Markdown.toHtml(full, markdownPipeline);
      summaryHtml = Markdown.toHtml(before, markdownPipeline).trim();
    }
    plainText = Markdown.toPlainText(full, markdownPipeline);
  } else {
    if (hookCtx.hasAnyHooks()) {
      html = renderMarkdownWithHooks(textAfterMarkdownShortcodes, hookCtx);
    } else {
      html = Markdown.toHtml(textAfterMarkdownShortcodes, markdownPipeline);
    }
    plainText = Markdown.toPlainText(textAfterMarkdownShortcodes, markdownPipeline);
    const summarySource = firstBlock(textAfterMarkdownShortcodes);
    if (summarySource === "") {
      summaryHtml = "";
    } else if (hookCtx.hasAnyHooks()) {
      summaryHtml = renderMarkdownWithHooks(summarySource, hookCtx).trim();
    } else {
      summaryHtml = Markdown.toHtml(summarySource, markdownPipeline).trim();
    }
  }

  // Step 5: Process standard-notation shortcodes ({{< ... >}}) AFTER markdown rendering
  const htmlCalls = parseShortcodes(html);
  if (htmlCalls.length > 0) {
    html = processShortcodes(html, page, site, env, ordinalTracker, undefined, recursionGuard);
  }

  return new MarkdownResult(html, summaryHtml, plainText, toc);
};
