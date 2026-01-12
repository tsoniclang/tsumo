import { Markdown } from "@tsumo/markdig/Markdig.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextIgnoreCase } from "../utils/strings.ts";
import { MarkdownResult } from "./result.ts";
import { markdownPipeline } from "./pipeline.ts";
import { generateTableOfContents } from "./toc.ts";

export const normalizeNewlines = (text: string): string => text.replaceLineEndings("\n");

export const summaryMarker = "<!--more-->";
export const summaryMarkerLength = summaryMarker.length;

export const findSummaryDividerIndex = (markdown: string): int => indexOfTextIgnoreCase(markdown, summaryMarker);

export const firstBlock = (markdown: string): string => {
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
