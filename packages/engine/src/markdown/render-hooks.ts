import { Markdown } from "@tsonic/dotnet/Markdig.js";
import { HtmlAttributesExtensions } from "@tsonic/dotnet/Markdig.Renderers.Html.js";
import { HtmlRenderer } from "@tsonic/dotnet/Markdig.Renderers.js";
import { HtmlBlockParser } from "@tsonic/dotnet/Markdig.Parsers.js";
import { HtmlBlock, ContainerBlock, HeadingBlock, LeafBlock } from "@tsonic/dotnet/Markdig.Syntax.js";
import type { MarkdownDocument } from "@tsonic/dotnet/Markdig.Syntax.js";
import { HtmlInline, ContainerInline, LinkInline } from "@tsonic/dotnet/Markdig.Syntax.Inlines.js";
import { StringLineGroup } from "@tsonic/dotnet/Markdig.Helpers.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { StringWriter } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import type { TemplateEnvironment } from "../template/environment.js";
import type { TemplateNode } from "../template/nodes.js";
import type { Template } from "../template/template.js";
import {
  LinkHookContext, LinkHookValue, ImageHookContext, ImageHookValue, HeadingHookContext, HeadingHookValue,
} from "../template/contexts.js";
import { PageContext, SiteContext } from "../models.js";
import { markdownPipeline, setupRenderer } from "./pipeline.js";
import { substringCount } from "../utils/strings.js";

// Render hook context for passing to Markdig renderer interceptors
export class RenderHookContext {
  page: PageContext;
  site: SiteContext;
  env: TemplateEnvironment;
  linkHook: Template | undefined;
  imageHook: Template | undefined;
  headingHook: Template | undefined;

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

// Shared HtmlBlockParser instance for creating HtmlBlocks
let sharedHtmlBlockParser: HtmlBlockParser | undefined = undefined;
const getHtmlBlockParser = (): HtmlBlockParser => {
  const existing = sharedHtmlBlockParser;
  if (existing !== undefined) return existing;
  const created = new HtmlBlockParser();
  sharedHtmlBlockParser = created;
  return created;
};

// Render inline children to HTML string (for hook .Text property)
const renderInlineChildrenToHtml = (container: ContainerInline): string => {
  const writer = new StringWriter();
  const renderer = new HtmlRenderer(writer);
  setupRenderer(renderer);
  renderer.WriteChildren(container);
  return writer.ToString();
};

const stripHtmlTags = (html: string): string => {
  const result = new StringBuilder();
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const c = substringCount(html, i, 1);
    if (c === "<") {
      inTag = true;
      continue;
    }
    if (c === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) result.Append(c);
  }
  return result.ToString();
};

// Render hook template helpers
const renderLinkHookTemplate = (
  template: Template,
  hookValue: LinkHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const emptyOverrides = new Map<string, TemplateNode[]>();
  return env.renderTemplate(template, hookValue, site, emptyOverrides);
};

const renderImageHookTemplate = (
  template: Template,
  hookValue: ImageHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const emptyOverrides = new Map<string, TemplateNode[]>();
  return env.renderTemplate(template, hookValue, site, emptyOverrides);
};

const renderHeadingHookTemplate = (
  template: Template,
  hookValue: HeadingHookValue,
  site: SiteContext,
  env: TemplateEnvironment,
): string => {
  const emptyOverrides = new Map<string, TemplateNode[]>();
  return env.renderTemplate(template, hookValue, site, emptyOverrides);
};

// AST rewriting: Replace hookable elements with HtmlInline/HtmlBlock containing hook output
// This approach modifies the AST before rendering, avoiding HTML post-processing entirely.

// Process inline elements - replaces LinkInline with HtmlInline containing hook output
const rewriteInlinesForHooks = (container: ContainerInline, hookCtx: RenderHookContext): void => {
  // Collect links to rewrite (can't modify during iteration)
  const linksToRewrite: LinkInline[] = [];
  const it = container.GetEnumerator();
  while (it.MoveNext()) {
    const inline = it.Current;
    if (inline instanceof LinkInline) {
      const link = inline as LinkInline;
      const isImage = link.IsImage;
      const hasHook = isImage ? hookCtx.imageHook !== undefined : hookCtx.linkHook !== undefined;
      if (hasHook) {
        linksToRewrite.push(link);
      }
    }
    // Recurse into child containers first (before potential replacement)
    if (inline instanceof ContainerInline) rewriteInlinesForHooks(inline as ContainerInline, hookCtx);
  }
  it.Dispose();

  // Now perform replacements
  const linkArr = linksToRewrite;
  for (let i = 0; i < linkArr.length; i++) {
    const link = linkArr[i]!;
    const isImage = link.IsImage;
    const imageHook = hookCtx.imageHook;
    const linkHook = hookCtx.linkHook;

    if (isImage && imageHook !== undefined) {
      // For images: use the rendered label content as alt text
      const altHtml = renderInlineChildrenToHtml(link);
      const alt = stripHtmlTags(altHtml);
      const title = link.Title ?? "";
      const url = link.Url ?? "";

      const ctx = new ImageHookContext(url, alt, title, alt, hookCtx.page, hookCtx.page);
      const hookValue = new ImageHookValue(ctx);
      const hookHtml = renderImageHookTemplate(imageHook, hookValue, hookCtx.site, hookCtx.env);

      // Replace LinkInline with HtmlInline
      const htmlInline = new HtmlInline(hookHtml);
      link.ReplaceBy(htmlInline, false);
    } else if (!isImage && linkHook !== undefined) {
      // For links: render inner content to HTML
      const innerHtml = renderInlineChildrenToHtml(link);
      const plainText = stripHtmlTags(innerHtml);
      const title = link.Title ?? "";
      const url = link.Url ?? "";

      const ctx = new LinkHookContext(url, innerHtml, title, plainText, hookCtx.page, hookCtx.page);
      const hookValue = new LinkHookValue(ctx);
      const hookHtml = renderLinkHookTemplate(linkHook, hookValue, hookCtx.site, hookCtx.env);

      // Replace LinkInline with HtmlInline
      const htmlInline = new HtmlInline(hookHtml);
      link.ReplaceBy(htmlInline, false);
    }
  }
};

// Process block elements - replaces HeadingBlock with HtmlBlock containing hook output
const rewriteBlocksForHooks = (containerBlock: ContainerBlock, hookCtx: RenderHookContext): void => {
  // Collect headings to rewrite with their indices (can't modify during iteration)
  const headingsToRewrite: HeadingBlock[] = [];
  const headingIndices: int32[] = [];

  const blockIt = containerBlock.GetEnumerator();
  let idx = 0;
  while (blockIt.MoveNext()) {
    const block = blockIt.Current;

    if (block instanceof HeadingBlock && hookCtx.headingHook !== undefined) {
      const heading = block as HeadingBlock;
      headingsToRewrite.push(heading);
      headingIndices.push(idx);
    }

    // Process inlines in leaf blocks
    if (block instanceof LeafBlock) {
      const leaf = block as LeafBlock;
      const inline = leaf.Inline;
      if (inline != null) rewriteInlinesForHooks(inline, hookCtx);
    }

    // Recurse into child container blocks
    if (block instanceof ContainerBlock) rewriteBlocksForHooks(block as ContainerBlock, hookCtx);

    idx = idx + 1;
  }
  blockIt.Dispose();

  // Replace headings in reverse order (to preserve indices)
  const headingHookTemplate = hookCtx.headingHook;
  if (headingHookTemplate === undefined) return; // Type guard

  const headingArr = headingsToRewrite;
  const indexArr = headingIndices;
  for (let i = headingArr.length - 1; i >= 0; i--) {
    const heading = headingArr[i]!;
    const headingIdx = indexArr[i]!;

    // Get anchor ID from existing attributes
    const existingAttrs = HtmlAttributesExtensions.TryGetAttributes(heading);
    const anchor = existingAttrs?.Id ?? "";

    // Render inline content to HTML and plain text
    const inline = heading.Inline;
    const innerHtml = inline != null ? renderInlineChildrenToHtml(inline) : "";
    const plainText = stripHtmlTags(innerHtml);

    const ctx = new HeadingHookContext(heading.Level, innerHtml, plainText, anchor, hookCtx.page, hookCtx.page);
    const hookValue = new HeadingHookValue(ctx);
    const hookHtml = renderHeadingHookTemplate(headingHookTemplate, hookValue, hookCtx.site, hookCtx.env);

    // Create HtmlBlock with hook output
    const parser = getHtmlBlockParser();
    const htmlBlock = new HtmlBlock(parser);
    htmlBlock.Lines = new StringLineGroup(hookHtml);

    // Replace heading with HtmlBlock in parent
    containerBlock.RemoveAt(headingIdx);
    containerBlock.Insert(headingIdx, htmlBlock);
  }
};

// Apply render hooks by rewriting AST (no HTML post-processing)
const applyRenderHooksToAst = (document: MarkdownDocument, hookCtx: RenderHookContext): void => {
  if (!hookCtx.hasAnyHooks()) {
    return;
  }
  rewriteBlocksForHooks(document, hookCtx);
};

// Render markdown with hook support using true AST rewriting
export const renderMarkdownWithHooks = (
  markdown: string,
  hookCtx: RenderHookContext,
): string => {
  // Parse to AST, rewrite hookable elements, then render
  const document = Markdown.Parse(markdown, markdownPipeline);
  applyRenderHooksToAst(document, hookCtx);
  return Markdown.ToHtml(document, markdownPipeline);
};
