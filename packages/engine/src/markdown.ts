import { Markdown, MarkdownExtensions, MarkdownPipeline, MarkdownPipelineBuilder } from "@tsumo/markdig/Markdig.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextIgnoreCase } from "./utils/strings.ts";

export class MarkdownResult {
  readonly html: string;
  readonly summaryHtml: string;

  constructor(html: string, summaryHtml: string) {
    this.html = html;
    this.summaryHtml = summaryHtml;
  }
}

const createPipeline = (): MarkdownPipeline => {
  const builder = new MarkdownPipelineBuilder();
  MarkdownExtensions.useAutoIdentifiers(builder);
  MarkdownExtensions.usePipeTables(builder);
  MarkdownExtensions.useTaskLists(builder);
  MarkdownExtensions.useAutoLinks(builder);
  MarkdownExtensions.useEmphasisExtras(builder);
  return builder.build();
};

const pipeline = createPipeline();

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

  if (moreIndex >= 0) {
    const before = markdown.substring(0, moreIndex);
    const after = markdown.substring(moreIndex + summaryMarkerLength);
    const full = before + after;
    return new MarkdownResult(Markdown.toHtml(full, pipeline), Markdown.toHtml(before, pipeline).trim());
  }

  const html = Markdown.toHtml(markdown, pipeline);
  const summarySource = firstBlock(markdown);
  const summaryHtml = summarySource === "" ? "" : Markdown.toHtml(summarySource, pipeline).trim();
  return new MarkdownResult(html, summaryHtml);
};
