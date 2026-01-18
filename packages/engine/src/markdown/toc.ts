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
    sb.append(literal.toString());
    return;
  }

  const code = trycast<CodeInline>(inline);
  if (code !== null) {
    sb.append(code.content);
    return;
  }

  const entity = trycast<HtmlEntityInline>(inline);
  if (entity !== null) {
    sb.append(entity.transcoded.toString());
    return;
  }

  const autolink = trycast<AutolinkInline>(inline);
  if (autolink !== null) {
    sb.append(autolink.url);
    return;
  }

  const lineBreak = trycast<LineBreakInline>(inline);
  if (lineBreak !== null) {
    sb.append(" ");
    return;
  }

  const container = trycast<ContainerInline>(inline);
  if (container !== null) {
    const it = container.getEnumerator();
    while (it.moveNext()) appendInlinePlainText(it.current, sb);
    it.dispose();
  }
};

const getHeadingPlainText = (heading: HeadingBlock): string => {
  const inline = heading.inline;
  if (inline === undefined) return "";

  const sb = new StringBuilder();
  appendInlinePlainText(inline, sb);
  return sb.toString();
};

// Collect headings from AST using actual Markdig-generated IDs
const collectHeadingsFromAst = (document: ContainerBlock): TocHeading[] => {
  const headings = new List<TocHeading>();
  collectHeadingsRecursive(document, headings);
  return headings.toArray();
};

const collectHeadingsRecursive = (container: ContainerBlock, headings: List<TocHeading>): void => {
  const it = container.getEnumerator();
  while (it.moveNext()) {
    const block = it.current;

    const heading = trycast<HeadingBlock>(block);
    if (heading !== null) {
      // Get the ID from Markdig's HtmlAttributes (set by AutoIdentifiers extension)
      const attrs = HtmlAttributesExtensions.tryGetAttributes(heading);
      const id = attrs !== undefined && attrs.id !== undefined ? attrs.id : "";

      // Get plain text from heading content
      const text = getHeadingPlainText(heading);

      headings.add(new TocHeading(heading.level, text, id));
    }

    // Recurse into child containers
    const childContainer = trycast<ContainerBlock>(block);
    if (childContainer !== null) {
      collectHeadingsRecursive(childContainer, headings);
    }
  }
  it.dispose();
};

export const escapeHtmlText = (text: string): string => {
  let result = text;
  result = result.replace("&", "&amp;");
  result = result.replace("<", "&lt;");
  result = result.replace(">", "&gt;");
  result = result.replace("\"", "&quot;");
  return result;
};

export const generateTableOfContents = (markdown: string): string => {
  // Parse to AST to get actual Markdig-generated IDs
  const document = Markdown.parse(markdown, markdownPipeline);
  const headings = collectHeadingsFromAst(document);

  if (headings.length === 0) return `<nav id="TableOfContents"></nav>`;

  const sb = new StringBuilder();
  sb.append(`<nav id="TableOfContents">\n`);

  const listStack = new Stack<TocListFrame>();
  let currentLevel = 0;

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;

    // Clamp depth increases to avoid invalid placeholder <li> elements when headings skip levels.
    let targetLevel = h.level;
    if (currentLevel !== 0 && targetLevel > currentLevel + 1) targetLevel = currentLevel + 1;

    if (listStack.count === 0) {
      sb.append(`${indent(1)}<ul>\n`);
      listStack.push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    // Move up to target level (closing lists and items as needed)
    while (listStack.count > 0 && targetLevel < currentLevel) {
      const top = listStack.peek();
      if (top.liOpen) {
        sb.append(`${indent(listStack.count + 1)}</li>\n`);
        top.liOpen = false;
      }
      sb.append(`${indent(listStack.count)}</ul>\n`);
      listStack.pop();
      currentLevel = listStack.count > 0 ? listStack.peek().level : 0;
    }

    if (listStack.count === 0) {
      sb.append(`${indent(1)}<ul>\n`);
      listStack.push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    // Same level: close previous <li> before opening a sibling
    if (targetLevel === currentLevel) {
      const top = listStack.peek();
      if (top.liOpen) {
        sb.append(`${indent(listStack.count + 1)}</li>\n`);
        top.liOpen = false;
      }
    }

    // Descend one level (if needed) by opening a nested <ul> within the current open <li>
    if (targetLevel > currentLevel) {
      sb.append(`${indent(listStack.count + 1)}<ul>\n`);
      listStack.push(new TocListFrame(targetLevel));
      currentLevel = targetLevel;
    }

    sb.append(`${indent(listStack.count + 1)}<li><a href="#${h.id}">${escapeHtmlText(h.text)}</a>\n`);
    listStack.peek().liOpen = true;
  }

  while (listStack.count > 0) {
    const top = listStack.peek();
    if (top.liOpen) {
      sb.append(`${indent(listStack.count + 1)}</li>\n`);
      top.liOpen = false;
    }
    sb.append(`${indent(listStack.count)}</ul>\n`);
    listStack.pop();
  }

  sb.append(`</nav>`);
  return sb.toString();
};
