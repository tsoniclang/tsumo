import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import {
  codePointAtText,
  indexOfTextFrom,
  nextCodePointIndex,
  substringCount,
  substringFrom,
} from "../../utils/strings.js";
import { decodeTemplateStringLiteral } from "./string-literals.js";

export class TemplateSegment {
  isAction: boolean;
  text: string;
  line: int32;
  column: int32;

  constructor(isAction: boolean, text: string, line: int32, column: int32) {
    this.isAction = isAction;
    this.text = text;
    this.line = line;
    this.column = column;
  }
}

class TemplatePosition {
  line: int32;
  column: int32;

  constructor(line: int32, column: int32) {
    this.line = line;
    this.column = column;
  }
}

const positionAt = (source: string, offset: int32): TemplatePosition => {
  let line: int32 = 1;
  let lineStart: int32 = 0;
  let newline = indexOfTextFrom(source, "\n", 0);
  while (newline >= 0 && newline < offset) {
    line++;
    lineStart = newline + 1;
    newline = indexOfTextFrom(source, "\n", lineStart);
  }
  return new TemplatePosition(line, offset - lineStart + 1);
};

export const parseStringLiteral = (token: string): string | undefined => decodeTemplateStringLiteral(token);

export const sliceTokens = (tokens: string[], startIndex: int32): string[] => {
  const result: string[] = [];
  for (let index = startIndex; index < tokens.length; index++) result.push(tokens[index]!);
  return result;
};

export const scanTemplateSegments = (template: string, sourcePath?: string): TemplateSegment[] => {
  const segments: TemplateSegment[] = [];
  let offset: int32 = 0;
  let lastSegment: TemplateSegment | undefined = undefined;

  while (offset < template.length) {
    const start = indexOfTextFrom(template, "{{", offset);
    if (start < 0) {
      const position = positionAt(template, offset);
      const segment = new TemplateSegment(false, substringFrom(template, offset), position.line, position.column);
      segments.push(segment);
      break;
    }

    if (start > offset) {
      const position = positionAt(template, offset);
      const segment = new TemplateSegment(false, substringCount(template, offset, start - offset), position.line, position.column);
      segments.push(segment);
      lastSegment = segment;
    }

    const position = positionAt(template, start);
    const end = indexOfTextFrom(template, "}}", start + 2);
    if (end < 0) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_ACTION_UNCLOSED",
        "Template action opened with '{{' but has no closing '}}'",
        sourcePath,
        position.line,
        position.column,
      );
    }

    let action = substringCount(template, start + 2, end - start - 2);
    let leftTrim = false;
    let rightTrim = false;
    if (action.startsWith("-")) {
      leftTrim = true;
      action = substringFrom(action, 1);
    }
    if (action.endsWith("-")) {
      rightTrim = true;
      action = substringCount(action, 0, action.length - 1);
    }
    action = action.trim();

    if (leftTrim && lastSegment !== undefined && !lastSegment.isAction) {
      segments.pop();
      const trimmed = new TemplateSegment(
        false,
        lastSegment.text.trimEnd(),
        lastSegment.line,
        lastSegment.column,
      );
      segments.push(trimmed);
      lastSegment = trimmed;
    }

    const actionSegment = new TemplateSegment(true, action, position.line, position.column);
    segments.push(actionSegment);
    lastSegment = actionSegment;
    offset = end + 2;

    if (rightTrim) {
      while (offset < template.length) {
        const character = codePointAtText(template, offset);
        if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") break;
        offset = nextCodePointIndex(template, offset);
      }
    }
  }

  return segments;
};

export const tokenizeTemplateAction = (
  action: string,
  line?: int32,
  column?: int32,
  sourcePath?: string,
): string[] => {
  const tokens: string[] = [];
  let offset: int32 = 0;

  while (offset < action.length) {
    const character = codePointAtText(action, offset);
    const nextOffset = nextCodePointIndex(action, offset);
    if (character === " " || character === "\t" || character === "\r" || character === "\n") {
      offset = nextOffset;
      continue;
    }
    if (character === "|" || character === "(" || character === ")" || character === "," || character === "=") {
      tokens.push(character);
      offset = nextOffset;
      continue;
    }
    if (character === ":" && offset + 1 < action.length && substringCount(action, offset + 1, 1) === "=") {
      tokens.push(":=");
      offset += 2;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      const quote = character;
      const tokenStart = offset;
      offset = nextOffset;
      let escaped = false;
      while (offset < action.length) {
        const current = codePointAtText(action, offset);
        if ((quote === "`" || !escaped) && current === quote) break;
        if (quote !== "`") {
          escaped = !escaped && current === "\\";
          if (current !== "\\") escaped = false;
        }
        offset = nextCodePointIndex(action, offset);
      }
      if (offset >= action.length) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_STRING_UNCLOSED",
          `Template string opened with ${quote} but is not closed`,
          sourcePath,
          line,
          column,
        );
      }
      offset = nextCodePointIndex(action, offset);
      tokens.push(substringCount(action, tokenStart, offset - tokenStart));
      continue;
    }

    const tokenStart = offset;
    while (offset < action.length) {
      const current = codePointAtText(action, offset);
      if (
        current === " " || current === "\t" || current === "\r" || current === "\n" ||
        current === "|" || current === "(" || current === ")" || current === "," || current === "="
      ) break;
      if (current === ":" && offset + 1 < action.length && substringCount(action, offset + 1, 1) === "=") break;
      offset = nextCodePointIndex(action, offset);
    }
    tokens.push(substringCount(action, tokenStart, offset - tokenStart));
  }

  return tokens;
};
