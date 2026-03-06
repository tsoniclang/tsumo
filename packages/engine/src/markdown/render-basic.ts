import { Markdown } from "markdig-types/Markdig.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextIgnoreCase, replaceLineEndings, substringCount, substringFrom } from "../utils/strings.ts";
import { MarkdownResult } from "./result.ts";
import { markdownPipeline } from "./pipeline.ts";
import { generateTableOfContents } from "./toc.ts";

export const normalizeNewlines = (text: string): string => replaceLineEndings(text, "\n");

export const summaryMarker = "<!--more-->";
export const summaryMarkerLength = summaryMarker.length;

export const findSummaryDividerIndex = (markdown: string): int => indexOfTextIgnoreCase(markdown, summaryMarker);

export const firstBlock = (markdown: string): string => {
  const text = markdown.trim();
  if (text === "") return "";
  const idx = indexOfText(text, "\n\n");
  return idx >= 0 ? substringCount(text, 0, idx) : text;
};

export const renderMarkdown = (markdownRaw: string): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const moreIndex = findSummaryDividerIndex(markdown);
  const toc = generateTableOfContents(markdown);

  if (moreIndex >= 0) {
    const before = substringCount(markdown, 0, moreIndex);
    const after = substringFrom(markdown, moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(
      Markdown.ToHtml(full, markdownPipeline),
      Markdown.ToHtml(before, markdownPipeline).trim(),
      Markdown.ToPlainText(full, markdownPipeline),
      toc,
    );
  }

  const html = Markdown.ToHtml(markdown, markdownPipeline);
  const plainText = Markdown.ToPlainText(markdown, markdownPipeline);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : Markdown.ToHtml(summarySource, markdownPipeline).trim();
  return new MarkdownResult(html, summaryHtml, plainText, toc);
};
