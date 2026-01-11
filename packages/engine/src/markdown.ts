import { Markdown, MarkdownExtensions, MarkdownPipeline, MarkdownPipelineBuilder } from "@tsumo/markdig/Markdig.js";
import { AutoIdentifierOptions } from "@tsumo/markdig/Markdig.Extensions.AutoIdentifiers.js";
import { HtmlAttributes, HtmlAttributesExtensions } from "@tsumo/markdig/Markdig.Renderers.Html.js";
import type { Block, ContainerBlock, HeadingBlock, LeafBlock, MarkdownDocument } from "@tsumo/markdig/Markdig.Syntax.js";
import type { ContainerInline, Inline, LinkInline } from "@tsumo/markdig/Markdig.Syntax.Inlines.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import { trycast } from "@tsonic/core/lang.js";
import { indexOfText, indexOfTextIgnoreCase } from "./utils/strings.ts";
import { parseShortcodes, ShortcodeCall, innerDeindent } from "./shortcode.ts";
import {
  ShortcodeContext, ShortcodeValue, RenderScope, TemplateEnvironment, TemplateNode, PageValue, Template,
  LinkHookContext, LinkHookValue, ImageHookContext, ImageHookValue, HeadingHookContext, HeadingHookValue
} from "./template/index.ts";
import { PageContext, SiteContext } from "./models.ts";
import { ParamValue } from "./params.ts";

export class MarkdownResult {
  readonly html: string;
  readonly summaryHtml: string;
  readonly plainText: string;
  readonly tableOfContents: string;

  constructor(html: string, summaryHtml: string, plainText: string, tableOfContents: string) {
    this.html = html;
    this.summaryHtml = summaryHtml;
    this.plainText = plainText;
    this.tableOfContents = tableOfContents;
  }
}

const createPipeline = (): MarkdownPipeline => {
  const builder = new MarkdownPipelineBuilder();
  MarkdownExtensions.useAutoIdentifiers(builder, AutoIdentifierOptions.gitHub);
  MarkdownExtensions.usePipeTables(builder);
  MarkdownExtensions.useTaskLists(builder);
  MarkdownExtensions.useAutoLinks(builder);
  MarkdownExtensions.useEmphasisExtras(builder);
  MarkdownExtensions.useGenericAttributes(builder);
  MarkdownExtensions.useAlertBlocks(builder);
  return builder.build();
};

export const markdownPipeline = createPipeline();

const normalizeNewlines = (text: string): string => text.replaceLineEndings("\n");

const summaryMarker = "<!--more-->";
const summaryMarkerLength = summaryMarker.length;

const findSummaryDividerIndex = (markdown: string): int => indexOfTextIgnoreCase(markdown, summaryMarker);

const firstBlock = (markdown: string): string => {
  const text = markdown.trim();
  if (text === "") return "";
  const idx = indexOfText(text, "\n\n");
  return idx >= 0 ? text.substring(0, idx) : text;
};

export const renderMarkdown = (markdownRaw: string): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const moreIndex = findSummaryDividerIndex(markdown);
  const toc = generateTableOfContents(markdown);

  if (moreIndex >= 0) {
    const before = markdown.substring(0, moreIndex);
    const after = markdown.substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(
      Markdown.toHtml(full, markdownPipeline),
      Markdown.toHtml(before, markdownPipeline).trim(),
      Markdown.toPlainText(full, markdownPipeline),
      toc,
    );
  }

  const html = Markdown.toHtml(markdown, markdownPipeline);
  const plainText = Markdown.toPlainText(markdown, markdownPipeline);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : Markdown.toHtml(summarySource, markdownPipeline).trim();
  return new MarkdownResult(html, summaryHtml, plainText, toc);
};

// TOC Generation
class TocHeading {
  readonly level: int;
  readonly text: string;
  readonly id: string;

  constructor(level: int, text: string, id: string) {
    this.level = level;
    this.text = text;
    this.id = id;
  }
}

const parseHeadings = (markdown: string): TocHeading[] => {
  const headings = new List<TocHeading>();
  const lines = markdown.split("\n");

  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Check for fence toggle
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const fc = trimmed.substring(0, 1);
      let len = 1;
      while (len < trimmed.length && trimmed.substring(len, 1) === fc) len++;
      if (!inFence && len >= 3) {
        inFence = true;
        fenceChar = fc;
        fenceLen = len;
        continue;
      }
      if (inFence && fc === fenceChar && len >= fenceLen) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
        continue;
      }
    }

    if (inFence) continue;

    // Check for ATX headings
    if (trimmed.startsWith("#")) {
      let level = 0;
      while (level < trimmed.length && trimmed.substring(level, 1) === "#") level++;
      if (level >= 1 && level <= 6 && level < trimmed.length) {
        const afterHash = trimmed.substring(level, 1);
        if (afterHash === " " || afterHash === "\t") {
          const text = trimmed.substring(level).trim();
          const id = generateGitHubId(text);
          headings.add(new TocHeading(level, text, id));
        }
      }
    }
  }

  return headings.toArray();
};

const isLowerAlpha = (c: string): boolean => {
  return c === "a" || c === "b" || c === "c" || c === "d" || c === "e" || c === "f" || c === "g" ||
         c === "h" || c === "i" || c === "j" || c === "k" || c === "l" || c === "m" || c === "n" ||
         c === "o" || c === "p" || c === "q" || c === "r" || c === "s" || c === "t" || c === "u" ||
         c === "v" || c === "w" || c === "x" || c === "y" || c === "z";
};

const isDigit = (c: string): boolean => {
  return c === "0" || c === "1" || c === "2" || c === "3" || c === "4" ||
         c === "5" || c === "6" || c === "7" || c === "8" || c === "9";
};

const generateGitHubId = (text: string): string => {
  let id = "";
  const lower = text.toLowerInvariant();
  for (let i = 0; i < lower.length; i++) {
    const c = lower.substring(i, 1);
    if (isLowerAlpha(c)) {
      id += c;
    } else if (isDigit(c)) {
      id += c;
    } else if (c === " " || c === "-") {
      id += "-";
    } else if (c === "_") {
      id += "_";
    }
    // Other chars are stripped
  }
  // Remove consecutive dashes
  while (id.indexOf("--") >= 0) {
    id = id.replace("--", "-");
  }
  return id.trim();
};

const generateTableOfContents = (markdown: string): string => {
  const headings = parseHeadings(markdown);
  if (headings.length === 0) return `<nav id="TableOfContents"></nav>`;

  const sb = new StringBuilder();
  sb.append(`<nav id="TableOfContents">\n`);

  let currentLevel = 0;
  let openLists = 0;

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;

    while (currentLevel < h.level) {
      sb.append("  <ul>\n");
      currentLevel++;
      openLists++;
    }
    while (currentLevel > h.level) {
      sb.append("  </ul>\n");
      currentLevel--;
      openLists--;
    }

    sb.append(`    <li><a href="#${h.id}">${escapeHtmlText(h.text)}</a></li>\n`);
  }

  while (openLists > 0) {
    sb.append("  </ul>\n");
    openLists--;
  }

  sb.append(`</nav>`);
  return sb.toString();
};

const escapeHtmlText = (text: string): string => {
  let result = text;
  result = result.replace("&", "&amp;");
  result = result.replace("<", "&lt;");
  result = result.replace(">", "&gt;");
  result = result.replace("\"", "&quot;");
  return result;
};

// Render hook context for passing to Markdig renderer interceptors
class RenderHookContext {
  readonly page: PageContext;
  readonly site: SiteContext;
  readonly env: TemplateEnvironment;
  readonly linkHook: Template | undefined;
  readonly imageHook: Template | undefined;
  readonly headingHook: Template | undefined;

  constructor(page: PageContext, site: SiteContext, env: TemplateEnvironment) {
    this.page = page;
    this.site = site;
    this.env = env;
    this.linkHook = env.getRenderHookTemplate("render-link");
    this.imageHook = env.getRenderHookTemplate("render-image");
    this.headingHook = env.getRenderHookTemplate("render-heading");
  }

  hasAnyHooks(): boolean {
    return this.linkHook !== undefined || this.imageHook !== undefined || this.headingHook !== undefined;
  }
}

// Hook data collected during AST walk - stored for post-processing
class HookableHeading {
  readonly hookId: string;
  readonly level: int;
  readonly anchor: string;

  constructor(hookId: string, level: int, anchor: string) {
    this.hookId = hookId;
    this.level = level;
    this.anchor = anchor;
  }
}

class HookableLink {
  readonly hookId: string;
  readonly href: string;
  readonly title: string;
  readonly isImage: boolean;

  constructor(hookId: string, href: string, title: string, isImage: boolean) {
    this.hookId = hookId;
    this.href = href;
    this.title = title;
    this.isImage = isImage;
  }
}

class HookableElements {
  readonly headings: List<HookableHeading>;
  readonly links: List<HookableLink>;

  constructor() {
    this.headings = new List<HookableHeading>();
    this.links = new List<HookableLink>();
  }
}

// AST walking to inject hook markers and collect data
const hookMarkerAttr = "data-tsumo-hook";

// Helper class to track state during AST walking
class HookInjectionState {
  readonly elements: HookableElements;
  readonly hookCtx: RenderHookContext;
  counter: int;

  constructor(hookCtx: RenderHookContext) {
    this.elements = new HookableElements();
    this.hookCtx = hookCtx;
    this.counter = 0;
  }

  nextId(): string {
    this.counter = this.counter + 1;
    return `hook-${this.counter}`;
  }
}

// Process inline elements - handles recursive inline structures
const walkInlinesForHooks = (container: ContainerInline, state: HookInjectionState): void => {
  const it = container.getEnumerator();
  while (it.moveNext()) {
    const inline = it.current;

    const link = trycast<LinkInline>(inline);
    if (link !== null) {
      const isImage = link.isImage;
      const hasHook = isImage ? state.hookCtx.imageHook !== undefined : state.hookCtx.linkHook !== undefined;
      if (hasHook) {
        const hookId = state.nextId();
        const attrs = HtmlAttributesExtensions.getAttributes(link);
        attrs.addProperty(hookMarkerAttr, hookId);
        state.elements.links.add(new HookableLink(hookId, link.url, link.title !== undefined ? link.title : "", isImage));
      }
    }

    const childContainer = trycast<ContainerInline>(inline);
    if (childContainer !== null) walkInlinesForHooks(childContainer, state);
  }
  it.dispose();
};

// Process block elements - handles recursive block structures
const walkBlockForHooks = (block: Block, state: HookInjectionState): void => {
  const heading = trycast<HeadingBlock>(block);
  if (heading !== null && state.hookCtx.headingHook !== undefined) {
    const hookId = state.nextId();
    const attrs = HtmlAttributesExtensions.getAttributes(heading);
    // Get the auto-generated id if present
    const existingAttrs = HtmlAttributesExtensions.tryGetAttributes(heading);
    const anchor = existingAttrs !== undefined && existingAttrs.id !== undefined ? existingAttrs.id : "";
    attrs.addProperty(hookMarkerAttr, hookId);
    state.elements.headings.add(new HookableHeading(hookId, heading.level, anchor));
  }

  const leaf = trycast<LeafBlock>(block);
  if (leaf !== null) {
    const inline = leaf.inline;
    if (inline !== undefined) walkInlinesForHooks(inline, state);
  }

  const container = trycast<ContainerBlock>(block);
  if (container !== null) {
    const it = container.getEnumerator();
    while (it.moveNext()) walkBlockForHooks(it.current, state);
    it.dispose();
  }
};

const injectHookMarkers = (document: MarkdownDocument, hookCtx: RenderHookContext): HookableElements => {
  const state = new HookInjectionState(hookCtx);
  walkBlockForHooks(document, state);
  return state.elements;
};

// Render hook template helpers
const renderLinkHookTemplate = (
  template: Template,
  hookValue: LinkHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const sb = new StringBuilder();
  const scope = new RenderScope(hookValue, hookValue, site, env, undefined);
  const emptyOverrides = new Dictionary<string, TemplateNode[]>();
  template.renderInto(sb, scope, env, emptyOverrides);
  return sb.toString();
};

const renderImageHookTemplate = (
  template: Template,
  hookValue: ImageHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const sb = new StringBuilder();
  const scope = new RenderScope(hookValue, hookValue, site, env, undefined);
  const emptyOverrides = new Dictionary<string, TemplateNode[]>();
  template.renderInto(sb, scope, env, emptyOverrides);
  return sb.toString();
};

const renderHeadingHookTemplate = (
  template: Template,
  hookValue: HeadingHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const sb = new StringBuilder();
  const scope = new RenderScope(hookValue, hookValue, site, env, undefined);
  const emptyOverrides = new Dictionary<string, TemplateNode[]>();
  template.renderInto(sb, scope, env, emptyOverrides);
  return sb.toString();
};

// Extract text from between HTML tags (simple approach)
const extractTextFromHtml = (html: string): string => {
  let result = "";
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const c = html.substring(i, 1);
    if (c === "<") {
      inTag = true;
    } else if (c === ">") {
      inTag = false;
    } else if (!inTag) {
      result += c;
    }
  }
  return result;
};

// Parse attribute value from HTML tag
const parseAttr = (tag: string, attrName: string): string => {
  const prefix = ` ${attrName}="`;
  const idx = tag.indexOf(prefix);
  if (idx < 0) return "";
  const startIdx = idx + prefix.length;
  const endIdx = tag.indexOf("\"", startIdx);
  if (endIdx < 0) return "";
  return tag.substring(startIdx, endIdx - startIdx);
};

// Apply render hooks using AST-injected markers for reliable element matching.
// The markers (data-tsumo-hook="hook-N") are injected during AST walking before rendering,
// ensuring we can find and replace exact elements without fragile HTML pattern matching.
const applyRenderHooksWithMarkers = (
  html: string,
  elements: HookableElements,
  hookCtx: RenderHookContext,
): string => {
  if (!hookCtx.hasAnyHooks()) {
    return html;
  }

  let result = html;

  // Process headings - find by marker attribute
  if (hookCtx.headingHook !== undefined) {
    const headingArr = elements.headings.toArray();
    for (let i = 0; i < headingArr.length; i++) {
      const h = headingArr[i]!;
      const markerPattern = `${hookMarkerAttr}="${h.hookId}"`;
      const markerIdx = result.indexOf(markerPattern);
      if (markerIdx < 0) continue;

      // Find the start of the opening tag (search backward for '<h')
      let startIdx = markerIdx;
      while (startIdx > 0 && result.substring(startIdx, 2) !== "<h") {
        startIdx = startIdx - 1;
      }
      if (startIdx < 0) continue;

      // Find the closing tag
      const levelStr = h.level.toString();
      const closeTag = `</h${levelStr}>`;
      const endIdx = result.indexOf(closeTag, markerIdx);
      if (endIdx < 0) continue;

      // Extract inner HTML (content between > and </hN>)
      const tagEndIdx = result.indexOf(">", startIdx);
      if (tagEndIdx < 0 || tagEndIdx > endIdx) continue;
      const innerHtml = result.substring(tagEndIdx + 1, endIdx - tagEndIdx - 1);
      const plainText = extractTextFromHtml(innerHtml);

      const ctx = new HeadingHookContext(h.level, innerHtml, plainText, h.anchor, hookCtx.page);
      const hookValue = new HeadingHookValue(ctx);
      const hookHtml = renderHeadingHookTemplate(hookCtx.headingHook, hookValue, hookCtx.site, hookCtx.env);
      result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx + closeTag.length);
    }
  }

  // Process links and images - find by marker attribute
  const linkArr = elements.links.toArray();
  for (let i = 0; i < linkArr.length; i++) {
    const link = linkArr[i]!;
    const markerPattern = `${hookMarkerAttr}="${link.hookId}"`;
    const markerIdx = result.indexOf(markerPattern);
    if (markerIdx < 0) continue;

    if (link.isImage && hookCtx.imageHook !== undefined) {
      // Find the start of the <img tag (search backward)
      let startIdx = markerIdx;
      while (startIdx > 0 && result.substring(startIdx, 4) !== "<img") {
        startIdx = startIdx - 1;
      }
      if (startIdx < 0) continue;

      // Find end of img tag (either /> or >)
      let endIdx = result.indexOf("/>", markerIdx);
      if (endIdx < 0) {
        endIdx = result.indexOf(">", markerIdx);
        if (endIdx < 0) continue;
        endIdx = endIdx + 1;
      } else {
        endIdx = endIdx + 2;
      }

      // Extract alt from the tag
      const tagContent = result.substring(startIdx, endIdx - startIdx);
      const alt = parseAttr(tagContent, "alt");

      const ctx = new ImageHookContext(link.href, alt, link.title, alt, hookCtx.page);
      const hookValue = new ImageHookValue(ctx);
      const hookHtml = renderImageHookTemplate(hookCtx.imageHook, hookValue, hookCtx.site, hookCtx.env);
      result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx);
    } else if (!link.isImage && hookCtx.linkHook !== undefined) {
      // Find the start of the <a tag (search backward)
      let startIdx = markerIdx;
      while (startIdx > 0 && result.substring(startIdx, 2) !== "<a") {
        startIdx = startIdx - 1;
      }
      if (startIdx < 0) continue;

      // Find the closing </a> tag
      const endIdx = result.indexOf("</a>", markerIdx);
      if (endIdx < 0) continue;

      // Extract inner HTML
      const tagEndIdx = result.indexOf(">", startIdx);
      if (tagEndIdx < 0 || tagEndIdx > endIdx) continue;
      const innerHtml = result.substring(tagEndIdx + 1, endIdx - tagEndIdx - 1);
      const plainText = extractTextFromHtml(innerHtml);

      const ctx = new LinkHookContext(link.href, innerHtml, link.title, plainText, hookCtx.page);
      const hookValue = new LinkHookValue(ctx);
      const hookHtml = renderLinkHookTemplate(hookCtx.linkHook, hookValue, hookCtx.site, hookCtx.env);
      result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx + 4);
    }
  }

  return result;
};

// Render markdown with hook support using AST-based marker injection
const renderMarkdownWithHooks = (
  markdown: string,
  hookCtx: RenderHookContext,
): string => {
  // Parse to AST, inject markers, render, then apply hooks using markers
  const document = Markdown.parse(markdown, markdownPipeline);
  const elements = injectHookMarkers(document, hookCtx);
  const html = Markdown.toHtml(document, markdownPipeline);
  return applyRenderHooksWithMarkers(html, elements, hookCtx);
};

// Shortcode execution
class ShortcodeOrdinalTracker {
  private readonly counts: Dictionary<string, int>;

  constructor() {
    this.counts = new Dictionary<string, int>();
  }

  next(name: string): int {
    let count: int = 0;
    const has = this.counts.tryGetValue(name, count);
    const nextVal = has ? count + 1 : 0;
    this.counts.remove(name);
    this.counts.add(name, nextVal);
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
  const hasGuard = recursionGuard.tryGetValue(guardKey, isRecursing);
  if (hasGuard && isRecursing) {
    return `<!-- shortcode recursion detected: ${call.name} -->`;
  }

  recursionGuard.remove(guardKey);
  recursionGuard.add(guardKey, true);

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

  recursionGuard.remove(guardKey);
  recursionGuard.add(guardKey, false);

  return sb.toString();
};

const processShortcodes = (
  text: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
  ordinalTracker: ShortcodeOrdinalTracker,
  parent: ShortcodeContext | undefined,
  recursionGuard: Dictionary<string, boolean>,
): string => {
  const calls = parseShortcodes(text);
  if (calls.length === 0) return text;

  // Sort by startIndex descending to process from end to beginning
  const sorted = new List<ShortcodeCall>();
  for (let i = 0; i < calls.length; i++) sorted.add(calls[i]!);

  // Simple bubble sort by startIndex descending
  const arr = sorted.toArray();
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
    result = result.substring(0, call.startIndex) + replacement + result.substring(call.endIndex);
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
  const ordinalTracker = new ShortcodeOrdinalTracker();
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
      const replacement = executeShortcode(call, page, site, env, ordinalTracker, undefined, recursionGuard);
      textAfterMarkdownShortcodes = textAfterMarkdownShortcodes.substring(0, call.startIndex) + replacement + textAfterMarkdownShortcodes.substring(call.endIndex);
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
