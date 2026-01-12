import type { int } from "@tsonic/core/types.js";

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
