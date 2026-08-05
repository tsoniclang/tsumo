import type { int } from "@tsonic/csharp/types.js";

export class MarkdownResult {
  html: string;
  summaryHtml: string;
  plainText: string;
  tableOfContents: string;

  constructor(html: string, summaryHtml: string, plainText: string, tableOfContents: string) {
    this.html = html;
    this.summaryHtml = summaryHtml;
    this.plainText = plainText;
    this.tableOfContents = tableOfContents;
  }
}
