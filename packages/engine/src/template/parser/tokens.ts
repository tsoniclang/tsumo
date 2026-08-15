import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { IndexedSourceText } from "../../utils/indexed-source-text.js";
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

const positionAt = (source: IndexedSourceText, lineStarts: int32[], offset: int32): TemplatePosition => {
  let low: int32 = 0;
  let high = lineStarts.length as int32;
  while (low < high) {
    const middle = (low + Math.floor((high - low) / 2)) as int32;
    if (lineStarts[middle]! <= offset) low = middle + 1;
    else high = middle;
  }
  const lineIndex = low - 1;
  return new TemplatePosition(
    lineIndex + 1,
    source.utf16OffsetAt(offset) - source.utf16OffsetAt(lineStarts[lineIndex]!) + 1,
  );
};

const findDelimiter = (
  source: IndexedSourceText,
  first: string,
  second: string,
  start: int32,
): int32 => {
  for (let index = start; index + 1 < source.length; index++) {
    if (source.characterAt(index) === first && source.characterAt(index + 1) === second) return index;
  }
  return -1;
};

export const parseStringLiteral = (token: string): string | undefined => decodeTemplateStringLiteral(token);

export const sliceTokens = (tokens: string[], startIndex: int32): string[] => {
  const result: string[] = [];
  for (let index = startIndex; index < tokens.length; index++) result.push(tokens[index]!);
  return result;
};

export const scanTemplateSegments = (template: string, sourcePath?: string): TemplateSegment[] => {
  const source = new IndexedSourceText(template);
  const lineStarts: int32[] = [0];
  for (let index: int32 = 0; index < source.length; index++) {
    if (source.characterAt(index) === "\n") lineStarts.push(index + 1);
  }
  const segments: TemplateSegment[] = [];
  let offset: int32 = 0;
  let lastSegment: TemplateSegment | undefined = undefined;

  while (offset < source.length) {
    const start = findDelimiter(source, "{", "{", offset);
    if (start < 0) {
      const position = positionAt(source, lineStarts, offset);
      const segment = new TemplateSegment(false, source.slice(offset, source.length), position.line, position.column);
      segments.push(segment);
      break;
    }

    if (start > offset) {
      const position = positionAt(source, lineStarts, offset);
      const segment = new TemplateSegment(false, source.slice(offset, start), position.line, position.column);
      segments.push(segment);
      lastSegment = segment;
    }

    const position = positionAt(source, lineStarts, start);
    const end = findDelimiter(source, "}", "}", start + 2);
    if (end < 0) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_ACTION_UNCLOSED",
        "Template action opened with '{{' but has no closing '}}'",
        sourcePath,
        position.line,
        position.column,
      );
    }

    let action = source.slice(start + 2, end);
    let leftTrim = false;
    let rightTrim = false;
    if (action.startsWith("-")) {
      leftTrim = true;
      action = action.substring(1);
    }
    if (action.endsWith("-")) {
      rightTrim = true;
      action = action.substring(0, action.length - 1);
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
      while (offset < source.length) {
        const character = source.characterAt(offset);
        if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") break;
        offset++;
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
  const source = new IndexedSourceText(action);
  const tokens: string[] = [];
  let offset: int32 = 0;

  while (offset < source.length) {
    const character = source.characterAt(offset);
    const nextOffset = offset + 1;
    if (character === " " || character === "\t" || character === "\r" || character === "\n") {
      offset = nextOffset;
      continue;
    }
    if (character === ")") {
      const tokenStart = offset;
      offset = nextOffset;
      if (offset < source.length && source.characterAt(offset) === ".") {
        offset++;
        while (offset < source.length) {
          const current = source.characterAt(offset);
          if (
            current === " " || current === "\t" || current === "\r" || current === "\n" ||
            current === "|" || current === "(" || current === ")" || current === "," || current === "="
          ) break;
          if (current === ":" && offset + 1 < source.length && source.characterAt(offset + 1) === "=") break;
          offset++;
        }
      }
      tokens.push(source.slice(tokenStart, offset));
      continue;
    }
    if (character === "|" || character === "(" || character === "," || character === "=") {
      tokens.push(character);
      offset = nextOffset;
      continue;
    }
    if (character === ":" && offset + 1 < source.length && source.characterAt(offset + 1) === "=") {
      tokens.push(":=");
      offset += 2;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      const quote = character;
      const tokenStart = offset;
      offset = nextOffset;
      let escaped = false;
      while (offset < source.length) {
        const current = source.characterAt(offset);
        if ((quote === "`" || !escaped) && current === quote) break;
        if (quote !== "`") {
          escaped = !escaped && current === "\\";
          if (current !== "\\") escaped = false;
        }
        offset++;
      }
      if (offset >= source.length) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_STRING_UNCLOSED",
          `Template string opened with ${quote} but is not closed`,
          sourcePath,
          line,
          column,
        );
      }
      offset++;
      tokens.push(source.slice(tokenStart, offset));
      continue;
    }

    const tokenStart = offset;
    while (offset < source.length) {
      const current = source.characterAt(offset);
      if (
        current === " " || current === "\t" || current === "\r" || current === "\n" ||
        current === "|" || current === "(" || current === ")" || current === "," || current === "="
      ) break;
      if (current === ":" && offset + 1 < source.length && source.characterAt(offset + 1) === "=") break;
      offset++;
    }
    tokens.push(source.slice(tokenStart, offset));
  }

  return tokens;
};
