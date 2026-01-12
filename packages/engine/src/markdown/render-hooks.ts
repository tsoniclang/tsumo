import { Markdown } from "@tsumo/markdig/Markdig.js";
import { HtmlAttributesExtensions } from "@tsumo/markdig/Markdig.Renderers.Html.js";
import { HtmlRenderer } from "@tsumo/markdig/Markdig.Renderers.js";
import { HtmlBlockParser } from "@tsumo/markdig/Markdig.Parsers.js";
import { HtmlBlock } from "@tsumo/markdig/Markdig.Syntax.js";
import type { ContainerBlock, HeadingBlock, LeafBlock, MarkdownDocument } from "@tsumo/markdig/Markdig.Syntax.js";
import { HtmlInline } from "@tsumo/markdig/Markdig.Syntax.Inlines.js";
import type { ContainerInline, LinkInline } from "@tsumo/markdig/Markdig.Syntax.Inlines.js";
import { StringLineGroup } from "@tsumo/markdig/Markdig.Helpers.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { StringWriter } from "@tsonic/dotnet/System.IO.js";
import type { int } from "@tsonic/core/types.js";
import { trycast } from "@tsonic/core/lang.js";
import {
  RenderScope, TemplateEnvironment, TemplateNode, Template,
  LinkHookContext, LinkHookValue, ImageHookContext, ImageHookValue, HeadingHookContext, HeadingHookValue
} from "../template/index.ts";
import { PageContext, SiteContext } from "../models.ts";
import { markdownPipeline, setupRenderer } from "./pipeline.ts";

// Render hook context for passing to Markdig renderer interceptors
export class RenderHookContext {
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

// Shared HtmlBlockParser instance for creating HtmlBlocks
let sharedHtmlBlockParser: object | undefined = undefined;
const getHtmlBlockParser = (): object => {
  if (sharedHtmlBlockParser === undefined) {
    sharedHtmlBlockParser = new HtmlBlockParser();
  }
  return sharedHtmlBlockParser;
};

// Render inline children to HTML string (for hook .Text property)
const renderInlineChildrenToHtml = (container: ContainerInline): string => {
  const writer = new StringWriter();
  const renderer = new HtmlRenderer(writer);
  setupRenderer(renderer);
  renderer.writeChildren(container);
  return writer.toString();
};

const stripHtmlTags = (html: string): string => {
  const result = new StringBuilder();
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const c = html.substring(i, 1);
    if (c === "<") {
      inTag = true;
      continue;
    }
    if (c === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) result.append(c);
  }
  return result.toString();
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

// AST rewriting: Replace hookable elements with HtmlInline/HtmlBlock containing hook output
// This approach modifies the AST before rendering, avoiding HTML post-processing entirely.

// Process inline elements - replaces LinkInline with HtmlInline containing hook output
const rewriteInlinesForHooks = (container: ContainerInline, hookCtx: RenderHookContext): void => {
  // Collect links to rewrite (can't modify during iteration)
  const linksToRewrite = new List<LinkInline>();
  const it = container.getEnumerator();
  while (it.moveNext()) {
    const inline = it.current;
    const link = trycast<LinkInline>(inline);
    if (link !== null) {
      const isImage = link.isImage;
      const hasHook = isImage ? hookCtx.imageHook !== undefined : hookCtx.linkHook !== undefined;
      if (hasHook) {
        linksToRewrite.add(link);
      }
    }
    // Recurse into child containers first (before potential replacement)
    const childContainer = trycast<ContainerInline>(inline);
    if (childContainer !== null) rewriteInlinesForHooks(childContainer, hookCtx);
  }
  it.dispose();

  // Now perform replacements
  const linkArr = linksToRewrite.toArray();
  for (let i = 0; i < linkArr.length; i++) {
    const link = linkArr[i]!;
    const isImage = link.isImage;

    if (isImage && hookCtx.imageHook !== undefined) {
      // For images: use the rendered label content as alt text
      const altHtml = renderInlineChildrenToHtml(link);
      const alt = stripHtmlTags(altHtml);
      const title = link.title !== undefined ? link.title : "";

      const ctx = new ImageHookContext(link.url, alt, title, alt, hookCtx.page);
      const hookValue = new ImageHookValue(ctx);
      const hookHtml = renderImageHookTemplate(hookCtx.imageHook, hookValue, hookCtx.site, hookCtx.env);

      // Replace LinkInline with HtmlInline
      const htmlInline = new HtmlInline(hookHtml);
      link.replaceBy(htmlInline, false);
    } else if (!isImage && hookCtx.linkHook !== undefined) {
      // For links: render inner content to HTML
      const innerHtml = renderInlineChildrenToHtml(link);
      const plainText = stripHtmlTags(innerHtml);
      const title = link.title !== undefined ? link.title : "";

      const ctx = new LinkHookContext(link.url, innerHtml, title, plainText, hookCtx.page);
      const hookValue = new LinkHookValue(ctx);
      const hookHtml = renderLinkHookTemplate(hookCtx.linkHook, hookValue, hookCtx.site, hookCtx.env);

      // Replace LinkInline with HtmlInline
      const htmlInline = new HtmlInline(hookHtml);
      link.replaceBy(htmlInline, false);
    }
  }
};

// Process block elements - replaces HeadingBlock with HtmlBlock containing hook output
const rewriteBlocksForHooks = (containerBlock: ContainerBlock, hookCtx: RenderHookContext): void => {
  // Collect headings to rewrite with their indices (can't modify during iteration)
  const headingsToRewrite = new List<HeadingBlock>();
  const headingIndices = new List<int>();

  const blockIt = containerBlock.getEnumerator();
  let idx = 0;
  while (blockIt.moveNext()) {
    const block = blockIt.current;

    const heading = trycast<HeadingBlock>(block);
    if (heading !== null && hookCtx.headingHook !== undefined) {
      headingsToRewrite.add(heading);
      headingIndices.add(idx);
    }

    // Process inlines in leaf blocks
    const leaf = trycast<LeafBlock>(block);
    if (leaf !== null) {
      const inline = leaf.inline;
      if (inline !== undefined) rewriteInlinesForHooks(inline, hookCtx);
    }

    // Recurse into child container blocks
    const childContainer = trycast<ContainerBlock>(block);
    if (childContainer !== null) rewriteBlocksForHooks(childContainer, hookCtx);

    idx = idx + 1;
  }
  blockIt.dispose();

  // Replace headings in reverse order (to preserve indices)
  const headingHookTemplate = hookCtx.headingHook;
  if (headingHookTemplate === undefined) return; // Type guard

  const headingArr = headingsToRewrite.toArray();
  const indexArr = headingIndices.toArray();
  for (let i = headingArr.length - 1; i >= 0; i--) {
    const heading = headingArr[i]!;
    const headingIdx = indexArr[i]!;

    // Get anchor ID from existing attributes
    const existingAttrs = HtmlAttributesExtensions.tryGetAttributes(heading);
    const anchor = existingAttrs !== undefined && existingAttrs.id !== undefined ? existingAttrs.id : "";

    // Render inline content to HTML and plain text
    const inline = heading.inline;
    const innerHtml = inline !== undefined ? renderInlineChildrenToHtml(inline) : "";
    const plainText = stripHtmlTags(innerHtml);

    const ctx = new HeadingHookContext(heading.level, innerHtml, plainText, anchor, hookCtx.page);
    const hookValue = new HeadingHookValue(ctx);
    const hookHtml = renderHeadingHookTemplate(headingHookTemplate, hookValue, hookCtx.site, hookCtx.env);

    // Create HtmlBlock with hook output
    const parser = getHtmlBlockParser();
    const htmlBlock = new HtmlBlock(parser as HtmlBlockParser);
    htmlBlock.lines = new StringLineGroup(hookHtml);

    // Replace heading with HtmlBlock in parent
    containerBlock.removeAt(headingIdx);
    containerBlock.insert(headingIdx, htmlBlock);
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
  const document = Markdown.parse(markdown, markdownPipeline);
  applyRenderHooksToAst(document, hookCtx);
  return Markdown.toHtml(document, markdownPipeline);
};
