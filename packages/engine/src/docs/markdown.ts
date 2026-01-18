import { Exception } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { char, int } from "@tsonic/core/types.js";
import { trycast } from "@tsonic/core/lang.js";
import { Markdown } from "markdig-types/Markdig.js";
import type { Block, ContainerBlock, LeafBlock, LinkReferenceDefinition, MarkdownDocument } from "markdig-types/Markdig.Syntax.js";
import type { ContainerInline, LinkInline } from "markdig-types/Markdig.Syntax.Inlines.js";
import { MarkdownResult, markdownPipeline } from "../markdown.ts";
import { DocsMountConfig } from "./models.ts";
import { indexOfText, indexOfTextIgnoreCase } from "../utils/strings.ts";
import { splitUrlSuffix } from "./url.ts";

export class DocsLinkRewriteContext {
  readonly mount: DocsMountConfig;
  readonly currentDirKey: string;
  readonly relPermalinkByRelPathLower: Dictionary<string, string>;
  readonly strictLinks: boolean;

  constructor(
    mount: DocsMountConfig,
    currentDirKey: string,
    relPermalinkByRelPathLower: Dictionary<string, string>,
    strictLinks: boolean,
  ) {
    this.mount = mount;
    this.currentDirKey = currentDirKey;
    this.relPermalinkByRelPathLower = relPermalinkByRelPathLower;
    this.strictLinks = strictLinks;
  }
}

const normalizeSlashes = (path: string): string => path.replace("\\", "/");

const isExternalUrl = (url: string): boolean => {
  const lower = url.trim().toLowerInvariant();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("//")
  );
};

const isMarkdownLink = (path: string): boolean => {
  const lower = path.trim().toLowerInvariant();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
};

const normalizeRelativePath = (baseDirKey: string, targetPath: string): string | undefined => {
  const base = baseDirKey.trim();
  const start = new List<string>();
  if (base !== "") {
    const baseParts = base.split("/");
    for (let i = 0; i < baseParts.length; i++) {
      const seg = baseParts[i]!.trim();
      if (seg !== "") start.add(seg);
    }
  }

  const target = normalizeSlashes(targetPath.trim());
  const parts = target.split("/");

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!;
    const seg = raw.trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (start.count === 0) return undefined;
      start.removeAt(start.count - 1);
      continue;
    }
    start.add(seg);
  }

  const arr = start.toArray();
  if (arr.length === 0) return "";
  let out = arr[0]!;
  for (let i = 1; i < arr.length; i++) out += "/" + arr[i]!;
  return out;
};

const computeGitHubBlobUrl = (mount: DocsMountConfig, repoRelPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash: char = "/";
  const repo = mount.repoUrl.trim().trimEnd(slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const rel = repoRelPath.trim().trimStart(slash);
  if (rel === "") return undefined;
  return `${repo}/blob/${branch}/${rel}`;
};

const maybeRewriteUrl = (urlRaw: string, ctx: DocsLinkRewriteContext): string | undefined => {
  const url = urlRaw.trim();
  if (url === "" || url.startsWith("#") || isExternalUrl(url)) return undefined;

  const split = splitUrlSuffix(url);
  const pathPart = split.path.trim();
  const suffix = split.suffix;
  if (pathPart === "") return undefined;

  const slash: char = "/";

  const mountPrefixLower = ctx.mount.urlPrefix.toLowerInvariant();
  const pathLower = pathPart.toLowerInvariant();

  let resolvedRel: string | undefined = undefined;
  let escaped = false;

  if (pathPart.startsWith("/")) {
    // Only rewrite site-absolute paths that are within the mount prefix.
    if (mountPrefixLower === "/") {
      resolvedRel = pathPart.trimStart(slash);
    } else if (pathLower.startsWith(mountPrefixLower)) {
      resolvedRel = pathPart.substring(ctx.mount.urlPrefix.length).trimStart(slash);
    } else {
      return undefined;
    }
  } else {
    resolvedRel = normalizeRelativePath(ctx.currentDirKey, pathPart);
    escaped = resolvedRel === undefined;
  }

  if (escaped) {
    if (ctx.strictLinks) {
      throw new Exception(`Out-of-mount link from ${ctx.mount.name}: ${url}`);
    }

    // Best-effort: rewrite to GitHub if mount has repo info.
    const repoPathRaw = ctx.mount.repoPath;
    if (repoPathRaw === undefined || repoPathRaw.trim() === "") return undefined;

    const repoPath = repoPathRaw.trim().trimStart(slash).trimEnd(slash);
    const baseDir = ctx.currentDirKey.trim() === "" ? repoPath : `${repoPath}/${ctx.currentDirKey}`;
    const repoRel = normalizeRelativePath(baseDir, pathPart);
    if (repoRel === undefined) return undefined;
    const gh = computeGitHubBlobUrl(ctx.mount, repoRel);
    return gh !== undefined ? gh + suffix : undefined;
  }

  if (resolvedRel === undefined) return undefined;

  // Only rewrite markdown file links to generated routes.
  if (!isMarkdownLink(resolvedRel)) return undefined;

  const key = resolvedRel.toLowerInvariant();
  let mapped = "";
  const ok = ctx.relPermalinkByRelPathLower.tryGetValue(key, mapped);
  return ok ? mapped + suffix : undefined;
};

const rewriteInInlines = (container: ContainerInline, ctx: DocsLinkRewriteContext): void => {
  const it = container.getEnumerator();
  while (it.moveNext()) {
    const inline = it.current;

    const link = trycast<LinkInline>(inline);
    if (link !== null) {
      const updated = maybeRewriteUrl(link.url, ctx);
      if (updated !== undefined) link.url = updated;
    }

    const childContainer = trycast<ContainerInline>(inline);
    if (childContainer !== null) rewriteInInlines(childContainer, ctx);
  }
  it.dispose();
};

const rewriteInBlock = (block: Block, ctx: DocsLinkRewriteContext): void => {
  const leaf = trycast<LeafBlock>(block);
  if (leaf !== null) {
    const inline = leaf.inline;
    if (inline !== undefined) rewriteInInlines(inline, ctx);

    const def = trycast<LinkReferenceDefinition>(block);
    if (def !== null) {
      const updated = maybeRewriteUrl(def.url, ctx);
      if (updated !== undefined) def.url = updated;
    }
  }

  const container = trycast<ContainerBlock>(block);
  if (container !== null) {
    const it = container.getEnumerator();
    while (it.moveNext()) rewriteInBlock(it.current, ctx);
    it.dispose();
  }
};

const rewriteLinks = (document: MarkdownDocument, ctx: DocsLinkRewriteContext): void => {
  rewriteInBlock(document, ctx);
};

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

const renderWithRewrites = (markdown: string, ctx: DocsLinkRewriteContext): string => {
  const doc = Markdown.parse(markdown, markdownPipeline);
  rewriteLinks(doc, ctx);
  return Markdown.toHtml(doc, markdownPipeline);
};

export const renderDocsMarkdown = (markdownRaw: string, ctx: DocsLinkRewriteContext): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const moreIndex = findSummaryDividerIndex(markdown);

  if (moreIndex >= 0) {
    const before = markdown.substring(0, moreIndex);
    const after = markdown.substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(renderWithRewrites(full, ctx), renderWithRewrites(before, ctx).trim(), Markdown.toPlainText(full, markdownPipeline), "");
  }

  const html = renderWithRewrites(markdown, ctx);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : renderWithRewrites(summarySource, ctx).trim();
  return new MarkdownResult(html, summaryHtml, Markdown.toPlainText(markdown, markdownPipeline), "");
};
