import { Markdown } from "markdig-types/Markdig.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextIgnoreCase } from "../utils/strings.ts";
import { MarkdownResult } from "./result.ts";
import { markdownPipeline } from "./pipeline.ts";
import { generateTableOfContents } from "./toc.ts";

export const normalizeNewlines = (text: string): string => text.ReplaceLineEndings("\n");

export const summaryMarker = "<!--more-->";
export const summaryMarkerLength = summaryMarker.Length;

export const findSummaryDividerIndex = (markdown: string): int => indexOfTextIgnoreCase(markdown, summaryMarker);

export const firstBlock = (markdown: string): string => {
  const text = markdown.Trim();
  if (text === "") return "";
  const idx = indexOfText(text, "\n\n");
  return idx >= 0 ? text.Substring(0, idx) : text;
};

export const renderMarkdown = (markdownRaw: string): MarkdownResult => {
  const markdown = normalizeNewlines(markdownRaw);
  const moreIndex = findSummaryDividerIndex(markdown);
  const toc = generateTableOfContents(markdown);

  if (moreIndex >= 0) {
    const before = markdown.Substring(0, moreIndex);
    const after = markdown.Substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(
      Markdown.ToHtml(full, markdownPipeline),
      Markdown.ToHtml(before, markdownPipeline).Trim(),
      Markdown.ToPlainText(full, markdownPipeline),
      toc,
    );
  }

  const html = Markdown.ToHtml(markdown, markdownPipeline);
  const plainText = Markdown.ToPlainText(markdown, markdownPipeline);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : Markdown.ToHtml(summarySource, markdownPipeline).Trim();
  return new MarkdownResult(html, summaryHtml, plainText, toc);
};
