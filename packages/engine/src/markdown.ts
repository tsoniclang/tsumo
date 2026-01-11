import { Markdown, MarkdownExtensions, MarkdownPipeline, MarkdownPipelineBuilder } from "@tsumo/markdig/Markdig.js";
import { AutoIdentifierOptions } from "@tsumo/markdig/Markdig.Extensions.AutoIdentifiers.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextIgnoreCase } from "./utils/strings.ts";
import { parseShortcodes, ShortcodeCall, innerDeindent } from "./shortcode.ts";
import {
  ShortcodeContext, ShortcodeValue, RenderScope, TemplateEnvironment, TemplateNode, PageValue, Template,
  LinkHookContext, LinkHookValue, ImageHookContext, ImageHookValue, HeadingHookContext, HeadingHookValue
} from "./template.ts";
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

// Render hook helpers
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

// Apply render hooks to rendered HTML
const applyRenderHooks = (
  html: string,
  page: PageContext,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const linkHook = env.getRenderHookTemplate("render-link");
  const imageHook = env.getRenderHookTemplate("render-image");
  const headingHook = env.getRenderHookTemplate("render-heading");

  if (linkHook === undefined && imageHook === undefined && headingHook === undefined) {
    return html;
  }

  let result = html;

  // Apply heading hooks - match <h1-6 id="...">...</h1-6>
  if (headingHook !== undefined) {
    for (let level = 1; level <= 6; level++) {
      const levelStr = level.toString();
      const openTag = `<h${levelStr}`;
      const closeTag = `</h${levelStr}>`;
      let searchIdx = 0;
      while (true) {
        const startIdx = result.indexOf(openTag, searchIdx);
        if (startIdx < 0) break;
        const endIdx = result.indexOf(closeTag, startIdx);
        if (endIdx < 0) break;
        const fullMatch = result.substring(startIdx, endIdx - startIdx + closeTag.length);
        const tagEndIdx = result.indexOf(">", startIdx);
        if (tagEndIdx < 0 || tagEndIdx > endIdx) {
          searchIdx = startIdx + 1;
          continue;
        }
        const tagPart = result.substring(startIdx, tagEndIdx - startIdx + 1);
        const anchor = parseAttr(tagPart, "id");
        const innerHtml = result.substring(tagEndIdx + 1, endIdx - tagEndIdx - 1);
        const plainText = extractTextFromHtml(innerHtml);
        const ctx = new HeadingHookContext(level, innerHtml, plainText, anchor, page);
        const hookValue = new HeadingHookValue(ctx);
        const hookHtml = renderHeadingHookTemplate(headingHook, hookValue, site, env);
        result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx + closeTag.length);
        searchIdx = startIdx + hookHtml.length;
      }
    }
  }

  // Apply image hooks - match <img src="..." alt="..." title="..." />
  if (imageHook !== undefined) {
    let searchIdx = 0;
    while (true) {
      const startIdx = result.indexOf("<img ", searchIdx);
      if (startIdx < 0) break;
      let endIdx = result.indexOf("/>", startIdx);
      if (endIdx < 0) {
        endIdx = result.indexOf(">", startIdx);
        if (endIdx < 0) break;
        endIdx = endIdx + 1;
      } else {
        endIdx = endIdx + 2;
      }
      const fullMatch = result.substring(startIdx, endIdx - startIdx);
      const src = parseAttr(fullMatch, "src");
      const alt = parseAttr(fullMatch, "alt");
      const title = parseAttr(fullMatch, "title");
      const ctx = new ImageHookContext(src, alt, title, alt, page);
      const hookValue = new ImageHookValue(ctx);
      const hookHtml = renderImageHookTemplate(imageHook, hookValue, site, env);
      result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx);
      searchIdx = startIdx + hookHtml.length;
    }
  }

  // Apply link hooks - match <a href="...">...</a>
  if (linkHook !== undefined) {
    let searchIdx = 0;
    while (true) {
      const startIdx = result.indexOf("<a ", searchIdx);
      if (startIdx < 0) break;
      const endIdx = result.indexOf("</a>", startIdx);
      if (endIdx < 0) break;
      const fullMatch = result.substring(startIdx, endIdx - startIdx + 4);
      const tagEndIdx = result.indexOf(">", startIdx);
      if (tagEndIdx < 0 || tagEndIdx > endIdx) {
        searchIdx = startIdx + 1;
        continue;
      }
      const tagPart = result.substring(startIdx, tagEndIdx - startIdx + 1);
      const href = parseAttr(tagPart, "href");
      const title = parseAttr(tagPart, "title");
      const innerHtml = result.substring(tagEndIdx + 1, endIdx - tagEndIdx - 1);
      const plainText = extractTextFromHtml(innerHtml);
      const ctx = new LinkHookContext(href, innerHtml, title, plainText, page);
      const hookValue = new LinkHookValue(ctx);
      const hookHtml = renderLinkHookTemplate(linkHook, hookValue, site, env);
      result = result.substring(0, startIdx) + hookHtml + result.substring(endIdx + 4);
      searchIdx = startIdx + hookHtml.length;
    }
  }

  return result;
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

  // Step 3: Render markdown
  const moreIndex = findSummaryDividerIndex(textAfterMarkdownShortcodes);
  let html: string;
  let summaryHtml: string;
  let plainText: string;

  if (moreIndex >= 0) {
    const before = textAfterMarkdownShortcodes.substring(0, moreIndex);
    const after = textAfterMarkdownShortcodes.substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    html = Markdown.toHtml(full, markdownPipeline);
    summaryHtml = Markdown.toHtml(before, markdownPipeline).trim();
    plainText = Markdown.toPlainText(full, markdownPipeline);
  } else {
    html = Markdown.toHtml(textAfterMarkdownShortcodes, markdownPipeline);
    plainText = Markdown.toPlainText(textAfterMarkdownShortcodes, markdownPipeline);
    const summarySource = firstBlock(textAfterMarkdownShortcodes);
    summaryHtml = summarySource === "" ? "" : Markdown.toHtml(summarySource, markdownPipeline).trim();
  }

  // Step 4: Apply render hooks (render-link, render-image, render-heading)
  html = applyRenderHooks(html, page, site, env);
  summaryHtml = applyRenderHooks(summaryHtml, page, site, env);

  // Step 5: Process standard-notation shortcodes ({{< ... >}}) AFTER markdown rendering
  const htmlCalls = parseShortcodes(html);
  if (htmlCalls.length > 0) {
    html = processShortcodes(html, page, site, env, ordinalTracker, undefined, recursionGuard);
  }

  return new MarkdownResult(html, summaryHtml, plainText, toc);
};
