import { Markdown } from "markdig-types/Markdig.js";
import { HtmlAttributesExtensions } from "markdig-types/Markdig.Renderers.Html.js";
import type { ContainerBlock, HeadingBlock } from "markdig-types/Markdig.Syntax.js";
import type {
  AutolinkInline,
  CodeInline,
  ContainerInline,
  HtmlEntityInline,
  Inline,
  LineBreakInline,
  LiteralInline,
} from "markdig-types/Markdig.Syntax.Inlines.js";
import { List, Stack } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import { trycast } from "@tsonic/core/lang.js";
import { markdownPipeline } from "./pipeline.ts";

class TocHeading {
  readonly level: int;
  readonly text: string;
  readonly id: string;

  constructor(level: int, text: string, id: string) {
    this.level = level;
    this.text = text;
    this.id = id;
  }
}

class TocListFrame {
  readonly level: int;
  liOpen: boolean;

  constructor(level: int) {
    this.level = level;
    this.liOpen = false;
  }
}

const indent = (depth: int): string => {
  let out = "";
  for (let i = 0; i < depth; i++) out += "  ";
  return out;
};

const appendInlinePlainText = (inline: Inline, sb: StringBuilder): void => {
  const literal = trycast<LiteralInline>(inline);
  if (literal !== null) {
    sb.Append(literal.ToString());
    return;
  }

  const code = trycast<CodeInline>(inline);
  if (code !== null) {
    sb.Append(code.Content);
    return;
  }

  const entity = trycast<HtmlEntityInline>(inline);
  if (entity !== null) {
    sb.Append(entity.Transcoded.ToString());
    return;
  }

  const autolink = trycast<AutolinkInline>(inline);
  if (autolink !== null) {
    sb.Append(autolink.Url);
    return;
  }

  const lineBreak = trycast<LineBreakInline>(inline);
  if (lineBreak !== null) {
    sb.Append(" ");
    return;
  }

  const container = trycast<ContainerInline>(inline);
  if (container !== null) {
    const it = container.GetEnumerator();
    while (it.MoveNext()) appendInlinePlainText(it.Current, sb);
    it.Dispose();
  }
};

const getHeadingPlainText = (heading: HeadingBlock): string => {
  const inline = heading.Inline;
  if (inline === undefined) return "";

  const sb = new StringBuilder();
  appendInlinePlainText(inline, sb);
  return sb.ToString();
};

// Collect headings from AST using actual Markdig-generated IDs
const collectHeadingsFromAst = (document: ContainerBlock): TocHeading[] => {
  const headings = new List<TocHeading>();
  collectHeadingsRecursive(document, headings);
  return headings.ToArray();
};

const collectHeadingsRecursive = (container: ContainerBlock, headings: List<TocHeading>): void => {
  const it = container.GetEnumerator();
  while (it.MoveNext()) {
    const block = it.Current;

    const heading = trycast<HeadingBlock>(block);
    if (heading !== null) {
      // Get the ID from Markdig's HtmlAttributes (set by AutoIdentifiers extension)
      const attrs = HtmlAttributesExtensions.TryGetAttributes(heading);
      const id = attrs !== undefined && attrs.Id !== undefined ? attrs.Id : "";

      // Get plain text from heading content
      const text = getHeadingPlainText(heading);

      headings.Add(new TocHeading(heading.Level, text, id));
    }

    // Recurse into child containers
    const childContainer = trycast<ContainerBlock>(block);
    if (childContainer !== null) {
      collectHeadingsRecursive(childContainer, headings);
    }
  }
  it.Dispose();
};

export const escapeHtmlText = (text: string): string => {
  let result = text;
  result = result.Replace("&", "&amp;");
  result = result.Replace("<", "&lt;");
  result = result.Replace(">", "&gt;");
  result = result.Replace("\"", "&quot;");
  return result;
};

export const generateTableOfContents = (markdown: string): string => {
  // Parse to AST to get actual Markdig-generated IDs
  const document = Markdown.Parse(markdown, markdownPipeline);
  const headings = collectHeadingsFromAst(document);

  if (headings.Length === 0) return `<nav id="TableOfContents"></nav>`;

  const sb = new StringBuilder();
  sb.Append(`<nav id="TableOfContents">\n`);

  const listStack = new Stack<TocListFrame>();
  let currentLevel = 0;

  for (let i = 0; i < headings.Length; i++) {
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
