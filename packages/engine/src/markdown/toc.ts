import { Markdown } from "@tsonic/dotnet/Markdig.js";
import { HtmlAttributesExtensions } from "@tsonic/dotnet/Markdig.Renderers.Html.js";
import { ContainerBlock, HeadingBlock } from "@tsonic/dotnet/Markdig.Syntax.js";
import {
  AutolinkInline,
  CodeInline,
  ContainerInline,
  HtmlEntityInline,
  LineBreakInline,
  LiteralInline,
} from "@tsonic/dotnet/Markdig.Syntax.Inlines.js";
import type { Inline } from "@tsonic/dotnet/Markdig.Syntax.Inlines.js";
import { Stack } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";
import { markdownPipeline } from "./pipeline.js";

class TocHeading {
  level: int32;
  text: string;
  id: string;

  constructor(level: int32, text: string, id: string) {
    this.level = level;
    this.text = text;
    this.id = id;
  }
}

class TocListFrame {
  level: int32;
  liOpen: boolean;

  constructor(level: int32) {
    this.level = level;
    this.liOpen = false;
  }
}

const indent = (depth: int32): string => {
  let out = "";
  for (let i = 0; i < depth; i++) out += "  ";
  return out;
};

const appendInlinePlainText = (inline: Inline, sb: StringBuilder): void => {
  if (inline instanceof LiteralInline) {
    const literal = inline as LiteralInline;
    sb.Append(literal.ToString());
    return;
  }

  if (inline instanceof CodeInline) {
    const code = inline as CodeInline;
    sb.Append(code.Content);
    return;
  }

  if (inline instanceof HtmlEntityInline) {
    const entity = inline as HtmlEntityInline;
    sb.Append(entity.Transcoded.ToString());
    return;
  }

  if (inline instanceof AutolinkInline) {
    const autolink = inline as AutolinkInline;
    sb.Append(autolink.Url);
    return;
  }

  if (inline instanceof LineBreakInline) {
    sb.Append(" ");
    return;
  }

  if (inline instanceof ContainerInline) {
    const container = inline as ContainerInline;
    const it = container.GetEnumerator();
    while (it.MoveNext()) appendInlinePlainText(it.Current, sb);
    it.Dispose();
  }
};

const getHeadingPlainText = (heading: HeadingBlock): string => {
  const inline = heading.Inline;
  if (inline == null) return "";

  const sb = new StringBuilder();
  appendInlinePlainText(inline, sb);
  return sb.ToString();
};

// Collect headings from AST using actual Markdig-generated IDs
const collectHeadingsFromAst = (document: ContainerBlock): TocHeading[] => {
  const headings: TocHeading[] = [];
  collectHeadingsRecursive(document, headings);
  return headings;
};

const collectHeadingsRecursive = (container: ContainerBlock, headings: TocHeading[]): void => {
  const it = container.GetEnumerator();
  while (it.MoveNext()) {
    const block = it.Current;

    if (block instanceof HeadingBlock) {
      const heading = block as HeadingBlock;
      // Get the ID from Markdig's HtmlAttributes (set by AutoIdentifiers extension)
      const attrs = HtmlAttributesExtensions.TryGetAttributes(heading);
      const id = attrs?.Id ?? "";

      // Get plain text from heading content
      const text = getHeadingPlainText(heading);

      headings.push(new TocHeading(heading.Level, text, id));
    }

    // Recurse into child containers
    if (block instanceof ContainerBlock) {
      collectHeadingsRecursive(block as ContainerBlock, headings);
    }
  }
  it.Dispose();
};

export const escapeHtmlText = (text: string): string => {
  let result = text;
  result = result.replaceAll("&", "&amp;");
  result = result.replaceAll("<", "&lt;");
  result = result.replaceAll(">", "&gt;");
  result = result.replaceAll("\"", "&quot;");
  return result;
};

export const generateTableOfContents = (markdown: string): string => {
  // Parse to AST to get actual Markdig-generated IDs
  const document = Markdown.Parse(markdown, markdownPipeline);
  const headings = collectHeadingsFromAst(document);

  if (headings.length === 0) return `<nav id="TableOfContents"></nav>`;

  const sb = new StringBuilder();
  sb.Append(`<nav id="TableOfContents">\n`);

  const listStack = new Stack<TocListFrame>();
  let currentLevel: int32 = 0;

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;

    // Clamp depth increases to avoid invalid placeholder <li> elements when headings skip levels.
    let targetLevel = h.level;
    if (currentLevel !== 0 && targetLevel > currentLevel + 1) targetLevel = currentLevel + 1;

    if (listStack.Count === 0) {
      sb.Append(`${indent(1)}<ul>\n`);
      listStack.Push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    // Move up to target level (closing lists and items as needed)
    while (listStack.Count > 0 && targetLevel < currentLevel) {
      const top = listStack.Peek();
      if (top.liOpen) {
        sb.Append(`${indent(listStack.Count + 1)}</li>\n`);
        top.liOpen = false;
      }
      sb.Append(`${indent(listStack.Count)}</ul>\n`);
      listStack.Pop();
      currentLevel = listStack.Count > 0 ? listStack.Peek().level : 0;
    }

    if (listStack.Count === 0) {
      sb.Append(`${indent(1)}<ul>\n`);
      listStack.Push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    // Same level: close previous <li> before opening a sibling
    if (targetLevel === currentLevel) {
      const top = listStack.Peek();
      if (top.liOpen) {
        sb.Append(`${indent(listStack.Count + 1)}</li>\n`);
        top.liOpen = false;
      }
    }

    // Descend one level (if needed) by opening a nested <ul> within the current open <li>
    if (targetLevel > currentLevel) {
      sb.Append(`${indent(listStack.Count + 1)}<ul>\n`);
      listStack.Push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    sb.Append(`${indent(listStack.Count + 1)}<li><a href="#${h.id}">${escapeHtmlText(h.text)}</a>\n`);
    listStack.Peek().liOpen = true;
  }

  while (listStack.Count > 0) {
    const top = listStack.Peek();
    if (top.liOpen) {
      sb.Append(`${indent(listStack.Count + 1)}</li>\n`);
      top.liOpen = false;
    }
    sb.Append(`${indent(listStack.Count)}</ul>\n`);
    listStack.Pop();
  }

  sb.Append(`</nav>`);
  return sb.ToString();
};
