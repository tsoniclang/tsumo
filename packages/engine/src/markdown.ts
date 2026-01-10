import { Char } from "@tsonic/dotnet/System.js";
import { StringReader } from "@tsonic/dotnet/System.IO.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { escapeHtml } from "./utils/html.ts";

const renderInline = (text: string): string => {
  const sb = new StringBuilder();
  let i = 0;

  const appendEscaped = (s: string): void => {
    if (s === "") return;
    sb.append(escapeHtml(s));
  };

  while (i < text.length) {
    if (text.substring(i).startsWith("![")) {
      const close = text.indexOf("](", i + 2);
      const end = close >= 0 ? text.indexOf(")", close + 2) : -1;
      if (close >= 0 && end >= 0) {
        const alt = text.substring(i + 2, close - (i + 2));
        const url = text.substring(close + 2, end - (close + 2));
        sb.append("<img alt=\"");
        sb.append(escapeHtml(alt));
        sb.append("\" src=\"");
        sb.append(escapeHtml(url));
        sb.append("\" />");
        i = end + 1;
        continue;
      }
    }

    if (text.substring(i).startsWith("[")) {
      const close = text.indexOf("](", i + 1);
      const end = close >= 0 ? text.indexOf(")", close + 2) : -1;
      if (close >= 0 && end >= 0) {
        const label = text.substring(i + 1, close - (i + 1));
        const url = text.substring(close + 2, end - (close + 2));
        sb.append("<a href=\"");
        sb.append(escapeHtml(url));
        sb.append("\">");
        sb.append(escapeHtml(label));
        sb.append("</a>");
        i = end + 1;
        continue;
      }
    }

    if (text.substring(i).startsWith("**")) {
      const end = text.indexOf("**", i + 2);
      if (end >= 0) {
        sb.append("<strong>");
        appendEscaped(text.substring(i + 2, end - (i + 2)));
        sb.append("</strong>");
        i = end + 2;
        continue;
      }
    }

    if (text.substring(i).startsWith("`")) {
      const end = text.indexOf("`", i + 1);
      if (end >= 0) {
        sb.append("<code>");
        appendEscaped(text.substring(i + 1, end - (i + 1)));
        sb.append("</code>");
        i = end + 1;
        continue;
      }
    }

    if (text.substring(i).startsWith("*")) {
      const end = text.indexOf("*", i + 1);
      if (end >= 0) {
        sb.append("<em>");
        appendEscaped(text.substring(i + 1, end - (i + 1)));
        sb.append("</em>");
        i = end + 1;
        continue;
      }
    }

    appendEscaped(text.substring(i, 1));
    i++;
  }

  return sb.toString();
};

export class MarkdownResult {
  readonly html: string;
  readonly summaryHtml: string;

  constructor(html: string, summaryHtml: string) {
    this.html = html;
    this.summaryHtml = summaryHtml;
  }
}

export const renderMarkdown = (markdown: string): MarkdownResult => {
  const reader = new StringReader(markdown);
  const out = new StringBuilder();
  const paragraph = new StringBuilder();

  let inCode = false;
  let inUl = false;
  let inOl = false;

  let summaryFound = false;
  let summaryHtml = "";

  const flushParagraph = (): void => {
    const text = paragraph.toString().trim();
    if (text === "") {
      paragraph.clear();
      return;
    }
    const rendered = renderInline(text);
    out.append("<p>");
    out.append(rendered);
    out.append("</p>\n");
    if (!summaryFound) {
      summaryHtml = "<p>" + rendered + "</p>";
      summaryFound = true;
    }
    paragraph.clear();
  };

  const closeLists = (): void => {
    if (inUl) {
      out.append("</ul>\n");
      inUl = false;
    }
    if (inOl) {
      out.append("</ol>\n");
      inOl = false;
    }
  };

  while (true) {
    const lineRaw = reader.readLine();
    if (lineRaw === undefined) break;
    const line = lineRaw;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeLists();
      if (!inCode) {
        out.append("<pre><code>");
        out.append("\n");
        inCode = true;
      } else {
        out.append("</code></pre>\n");
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      out.append(escapeHtml(line));
      out.append("\n");
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      closeLists();
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      flushParagraph();
      closeLists();
      out.append("<hr />\n");
      continue;
    }

    if (trimmed.startsWith("#")) {
      flushParagraph();
      closeLists();
      let level = 0;
      while (level < trimmed.length && trimmed.substring(level, 1) === "#") level++;
      if (level < 1) level = 1;
      if (level > 6) level = 6;
      const text = trimmed.substring(level).trim();
      out.append("<h");
      out.append(level.toString());
      out.append(">");
      out.append(renderInline(text));
      out.append("</h");
      out.append(level.toString());
      out.append(">\n");
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      closeLists();
      out.append("<blockquote><p>");
      out.append(renderInline(trimmed.substring(2)));
      out.append("</p></blockquote>\n");
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      flushParagraph();
      if (inOl) {
        out.append("</ol>\n");
        inOl = false;
      }
      if (!inUl) {
        out.append("<ul>\n");
        inUl = true;
      }
      out.append("<li>");
      out.append(renderInline(trimmed.substring(2)));
      out.append("</li>\n");
      continue;
    }

    const dot = trimmed.indexOf(". ");
    if (dot > 0) {
      const numberPart = trimmed.substring(0, dot);
      const numberPartTrimmed = numberPart.trim();
      let isNumber = numberPartTrimmed.length > 0;
      if (isNumber === true) {
        const digits = numberPartTrimmed.toCharArray();
        for (let j = 0; j < digits.length; j++) {
          if (!Char.isDigit(digits[j]!)) {
            isNumber = false;
            break;
          }
        }
      }

      if (isNumber === true) {
        flushParagraph();
        if (inUl) {
          out.append("</ul>\n");
          inUl = false;
        }
        if (!inOl) {
          out.append("<ol>\n");
          inOl = true;
        }
        out.append("<li>");
        out.append(renderInline(trimmed.substring(dot + 2)));
        out.append("</li>\n");
        continue;
      }
    }

    if (paragraph.length > 0) paragraph.append(" ");
    paragraph.append(trimmed);
  }

  flushParagraph();
  closeLists();
  if (inCode) out.append("</code></pre>\n");

  if (!summaryFound) summaryHtml = "";
  return new MarkdownResult(out.toString(), summaryHtml);
};
