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

const normalizeSlashes = (path: string): string => path.Replace("\\", "/");

const isExternalUrl = (url: string): boolean => {
  const lower = url.Trim().ToLowerInvariant();
  return (
    lower.StartsWith("http://") ||
    lower.StartsWith("https://") ||
    lower.StartsWith("mailto:") ||
    lower.StartsWith("tel:") ||
    lower.StartsWith("javascript:") ||
    lower.StartsWith("//")
  );
};

const isMarkdownLink = (path: string): boolean => {
  const lower = path.Trim().ToLowerInvariant();
  return lower.EndsWith(".md") || lower.EndsWith(".markdown");
};

const normalizeRelativePath = (baseDirKey: string, targetPath: string): string | undefined => {
  const base = baseDirKey.Trim();
  const start = new List<string>();
  if (base !== "") {
    const baseParts = base.Split("/");
    for (let i = 0; i < baseParts.Length; i++) {
      const seg = baseParts[i]!.Trim();
      if (seg !== "") start.Add(seg);
    }
  }

  const target = normalizeSlashes(targetPath.Trim());
  const parts = target.Split("/");

  for (let i = 0; i < parts.Length; i++) {
    const raw = parts[i]!;
    const seg = raw.Trim();
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (start.Count === 0) return undefined;
      start.RemoveAt(start.Count - 1);
      continue;
    }
    start.Add(seg);
  }

  const arr = start.ToArray();
  if (arr.Length === 0) return "";
  let out = arr[0]!;
  for (let i = 1; i < arr.Length; i++) out += "/" + arr[i]!;
  return out;
};

const computeGitHubBlobUrl = (mount: DocsMountConfig, repoRelPath: string): string | undefined => {
  if (mount.repoUrl === undefined) return undefined;
  const slash: char = "/";
  const repo = mount.repoUrl.Trim().TrimEnd(slash);
  if (repo === "") return undefined;
  const branch = mount.repoBranch.Trim() === "" ? "main" : mount.repoBranch.Trim();
  const rel = repoRelPath.Trim().TrimStart(slash);
  if (rel === "") return undefined;
  return `${repo}/blob/${branch}/${rel}`;
};

const maybeRewriteUrl = (urlRaw: string | undefined, ctx: DocsLinkRewriteContext): string | undefined => {
  if (urlRaw === undefined) return undefined;
  const url = urlRaw.Trim();
  if (url === "" || url.StartsWith("#") || isExternalUrl(url)) return undefined;

  const split = splitUrlSuffix(url);
  const pathPart = split.path.Trim();
  const suffix = split.suffix;
  if (pathPart === "") return undefined;

  const slash: char = "/";

  const mountPrefixLower = ctx.mount.urlPrefix.ToLowerInvariant();
  const pathLower = pathPart.ToLowerInvariant();

  let resolvedRel: string | undefined = undefined;
  let escaped = false;

  if (pathPart.StartsWith("/")) {
    // Only rewrite site-absolute paths that are within the mount prefix.
    if (mountPrefixLower === "/") {
      resolvedRel = pathPart.TrimStart(slash);
    } else if (pathLower.StartsWith(mountPrefixLower)) {
      resolvedRel = pathPart.Substring(ctx.mount.urlPrefix.Length).TrimStart(slash);
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
    if (repoPathRaw === undefined || repoPathRaw.Trim() === "") return undefined;

    const repoPath = repoPathRaw.Trim().TrimStart(slash).TrimEnd(slash);
    const baseDir = ctx.currentDirKey.Trim() === "" ? repoPath : `${repoPath}/${ctx.currentDirKey}`;
    const repoRel = normalizeRelativePath(baseDir, pathPart);
    if (repoRel === undefined) return undefined;
    const gh = computeGitHubBlobUrl(ctx.mount, repoRel);
    return gh !== undefined ? gh + suffix : undefined;
  }

  if (resolvedRel === undefined) return undefined;

  // Only rewrite markdown file links to generated routes.
  if (!isMarkdownLink(resolvedRel)) return undefined;

  const key = resolvedRel.ToLowerInvariant();
  let mapped = "";
  const ok = ctx.relPermalinkByRelPathLower.TryGetValue(key, mapped);
  return ok ? mapped + suffix : undefined;
};

const rewriteInInlines = (container: ContainerInline, ctx: DocsLinkRewriteContext): void => {
  const it = container.GetEnumerator();
  while (it.MoveNext()) {
    const inline = it.Current;

    const link = trycast<LinkInline>(inline);
    if (link !== null) {
      const updated = maybeRewriteUrl(link.Url, ctx);
      if (updated !== undefined) link.Url = updated;
    }

    const childContainer = trycast<ContainerInline>(inline);
    if (childContainer !== null) rewriteInInlines(childContainer, ctx);
  }
  it.Dispose();
};

const rewriteInBlock = (block: Block, ctx: DocsLinkRewriteContext): void => {
  const leaf = trycast<LeafBlock>(block);
  if (leaf !== null) {
    const inline = leaf.Inline;
    if (inline !== undefined) rewriteInInlines(inline, ctx);

    const def = trycast<LinkReferenceDefinition>(block);
    if (def !== null) {
      const updated = maybeRewriteUrl(def.Url, ctx);
      if (updated !== undefined) def.Url = updated;
    }
  }

  const container = trycast<ContainerBlock>(block);
  if (container !== null) {
    const it = container.GetEnumerator();
    while (it.MoveNext()) rewriteInBlock(it.Current, ctx);
    it.Dispose();
  }
};

const rewriteLinks = (document: MarkdownDocument, ctx: DocsLinkRewriteContext): void => {
  rewriteInBlock(document, ctx);
};

const normalizeNewlines = (text: string): string => text.ReplaceLineEndings("\n");

const summaryMarker = "<!--more-->";
const summaryMarkerLength = summaryMarker.Length;

const findSummaryDividerIndex = (markdown: string): int => indexOfTextIgnoreCase(markdown, summaryMarker);

const firstBlock = (markdown: string): string => {
  const text = markdown.Trim();
  if (text === "") return "";
  const idx = indexOfText(text, "\n\n");
  return idx >= 0 ? text.Substring(0, idx) : text;
};

const renderWithRewrites = (markdown: string, ctx: DocsLinkRewriteContext): string => {
  const doc = Markdown.Parse(markdown, markdownPipeline);
  rewriteLinks(doc, ctx);
  return Markdown.ToHtml(doc, markdownPipeline);
};

export const renderDocsMarkdown = (markdownRaw: string, ctx: DocsLinkRewriteContext): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const moreIndex = findSummaryDividerIndex(markdown);

  if (moreIndex >= 0) {
    const before = markdown.Substring(0, moreIndex);
    const after = markdown.Substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(renderWithRewrites(full, ctx), renderWithRewrites(before, ctx).Trim(), Markdown.ToPlainText(full, markdownPipeline), "");
  }

  const html = renderWithRewrites(markdown, ctx);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : renderWithRewrites(summarySource, ctx).Trim();
  return new MarkdownResult(html, summaryHtml, Markdown.ToPlainText(markdown, markdownPipeline), "");
};
