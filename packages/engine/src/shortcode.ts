import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "./diagnostics.js";
import { indexOfText, indexOfTextFrom, substringCount, substringFrom } from "./utils/strings.js";
import { ParamValue } from "./params.js";

export class ShortcodeCall {
  name: string;
  params: Map<string, ParamValue>;
  positionalParams: string[];
  isNamedParams: boolean;
  inner: string;
  isMarkdown: boolean;
  isSelfClosing: boolean;
  startIndex: int32;
  endIndex: int32;
  sourcePath: string | undefined;
  line: int32;
  column: int32;

  constructor(
    name: string,
    params: Map<string, ParamValue>,
    positionalParams: string[],
    isNamedParams: boolean,
    inner: string,
    isMarkdown: boolean,
    isSelfClosing: boolean,
    startIndex: int32,
    endIndex: int32,
    sourcePath: string | undefined,
    line: int32,
    column: int32,
  ) {
    this.name = name;
    this.params = params;
    this.positionalParams = positionalParams;
    this.isNamedParams = isNamedParams;
    this.inner = inner;
    this.isMarkdown = isMarkdown;
    this.isSelfClosing = isSelfClosing;
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.sourcePath = sourcePath;
    this.line = line;
    this.column = column;
  }
}

class ParseState {
  text: string;
  pos: int32;

  constructor(text: string) {
    this.text = text;
    this.pos = 0;
  }

  peek(offset: int32): string {
    const idx = this.pos + offset;
    return idx < this.text.length ? substringCount(this.text, idx, 1) : "";
  }

  peekString(length: int32): string {
    const remaining = this.text.length - this.pos;
    if (remaining <= 0) return "";
    const sliceLength = length < remaining ? length : remaining;
    return substringCount(this.text, this.pos, sliceLength);
  }

  advance(count: int32): void {
    this.pos += count;
  }

  atEnd(): boolean {
    return this.pos >= this.text.length;
  }

  skipWhitespace(): void {
    while (!this.atEnd()) {
      const c = this.peek(0);
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") break;
      this.advance(1);
    }
  }
}

class ShortcodePosition {
  line: int32;
  column: int32;

  constructor(line: int32, column: int32) {
    this.line = line;
    this.column = column;
  }
}

class ShortcodeRange {
  start: int32;
  end: int32;

  constructor(start: int32, end: int32) {
    this.start = start;
    this.end = end;
  }
}

class ShortcodeSourceMap {
  lineStarts: int32[];
  codeFences: ShortcodeRange[];

  constructor(text: string) {
    this.lineStarts = [0];
    for (let index: int32 = 0; index < text.length; index++) {
      const current = text[index]!;
      if (current === "\r") {
        if (index + 1 < text.length && text[index + 1] === "\n") index++;
        this.lineStarts.push(index + 1);
      } else if (current === "\n") {
        this.lineStarts.push(index + 1);
      }
    }

    this.codeFences = [];
    let fenceStart: int32 = -1;
    let fenceCharacter = "";
    let fenceLength: int32 = 0;
    let position: int32 = 0;
    while (position < text.length) {
      const current = text[position]!;
      if (fenceStart < 0 && (current === "`" || current === "~")) {
        let length: int32 = 1;
        while (position + length < text.length && text[position + length] === current) length++;
        if (length >= 3) {
          fenceStart = position;
          fenceCharacter = current;
          fenceLength = length;
          position += length;
          while (position < text.length && text[position] !== "\n") position++;
          continue;
        }
      } else if (fenceStart >= 0 && current === fenceCharacter) {
        let length: int32 = 1;
        while (position + length < text.length && text[position + length] === current) length++;
        if (length >= fenceLength) {
          this.codeFences.push(new ShortcodeRange(fenceStart, position + length));
          fenceStart = -1;
          fenceCharacter = "";
          fenceLength = 0;
          position += length;
          continue;
        }
      }
      position++;
    }
    if (fenceStart >= 0) this.codeFences.push(new ShortcodeRange(fenceStart, text.length));
  }

  positionAt(offset: int32): ShortcodePosition {
    let low: int32 = 0;
    let high: int32 = this.lineStarts.length - 1;
    while (low <= high) {
      const middle = (low + Math.floor((high - low) / 2)) as int32;
      if (this.lineStarts[middle]! <= offset) low = middle + 1;
      else high = middle - 1;
    }
    const lineIndex: int32 = high < 0 ? 0 : high;
    return new ShortcodePosition(lineIndex + 1, offset - this.lineStarts[lineIndex]! + 1);
  }

  isInCodeBlock(offset: int32): boolean {
    let low: int32 = 0;
    let high: int32 = this.codeFences.length - 1;
    while (low <= high) {
      const middle = (low + Math.floor((high - low) / 2)) as int32;
      const range = this.codeFences[middle]!;
      if (offset < range.start) high = middle - 1;
      else if (offset >= range.end) low = middle + 1;
      else return true;
    }
    return false;
  }
}

const parseQuotedString = (
  state: ParseState,
  sourcePath: string | undefined,
  line: int32,
  column: int32,
): string => {
  const quote = state.peek(0);
  if (quote !== "\"" && quote !== "'") return "";
  state.advance(1);

  let result = "";
  let closed = false;
  while (!state.atEnd()) {
    const c = state.peek(0);
    if (c === quote) {
      state.advance(1);
      closed = true;
      break;
    }
    if (c === "\\" && !state.atEnd()) {
      state.advance(1);
      result += state.peek(0);
      state.advance(1);
      continue;
    }
    result += c;
    state.advance(1);
  }
  if (!closed) {
    throw createTsumoError("TSUMO_SHORTCODE_STRING_UNCLOSED", `Shortcode string opened with ${quote} but is not closed`, sourcePath, line, column);
  }
  return result;
};

const parseUnquotedValue = (state: ParseState): string => {
  let result = "";
  while (!state.atEnd()) {
    const c = state.peek(0);
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === ">" || c === "%" || c === "/") break;
    result += c;
    state.advance(1);
  }
  return result;
};

const parseParams = (
  argsText: string,
  sourcePath: string | undefined,
  line: int32,
  column: int32,
): { params: Map<string, ParamValue>; positional: string[]; isNamed: boolean } => {
  const params = new Map<string, ParamValue>();
  const positional: string[] = [];
  let isNamed = false;

  const state = new ParseState(argsText.trim());

  while (!state.atEnd()) {
    state.skipWhitespace();
    if (state.atEnd()) break;

    const peek2 = state.peekString(2);
    if (peek2 === ">}" || peek2 === "%}" || peek2 === "/>" || peek2 === "/%") break;

    let key = "";
    let value = "";
    let foundEquals = false;

    while (!state.atEnd()) {
      const c = state.peek(0);
      if (c === "=" && state.peek(1) !== "=") {
        foundEquals = true;
        state.advance(1);
        break;
      }
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === ">" || c === "%" || c === "/") break;
      if (c === "\"" || c === "'") break;
      key += c;
      state.advance(1);
    }

    if (foundEquals) {
      if (key === "") {
        throw createTsumoError("TSUMO_SHORTCODE_PARAMETER_INVALID", "Shortcode named parameters require a name", sourcePath, line, column);
      }
      if (params.has(key)) {
        throw createTsumoError("TSUMO_SHORTCODE_PARAMETER_DUPLICATE", `Shortcode parameter '${key}' is declared more than once`, sourcePath, line, column);
      }
      isNamed = true;
      state.skipWhitespace();
      if (state.atEnd()) {
        throw createTsumoError("TSUMO_SHORTCODE_PARAMETER_INVALID", `Shortcode parameter '${key}' requires a value`, sourcePath, line, column);
      }
      const q = state.peek(0);
      const quoted = q === "\"" || q === "'";
      if (quoted) {
        value = parseQuotedString(state, sourcePath, line, column);
      } else {
        value = parseUnquotedValue(state);
      }
      if (!quoted && value === "") {
        throw createTsumoError("TSUMO_SHORTCODE_PARAMETER_INVALID", `Shortcode parameter '${key}' requires a value`, sourcePath, line, column);
      }
      params.set(key, quoted ? ParamValue.string(value) : ParamValue.parseScalar(value));
    } else {
      if (key === "") {
        const q = state.peek(0);
        if (q === "\"" || q === "'") key = parseQuotedString(state, sourcePath, line, column);
      }
      if (key !== "") {
        positional.push(key);
      }
    }
  }

  if (isNamed && positional.length > 0) {
    throw createTsumoError("TSUMO_SHORTCODE_PARAMETER_STYLE_MIXED", "Shortcode parameters cannot mix named and positional forms", sourcePath, line, column);
  }

  return { params, positional, isNamed };
};

const findClosingTag = (text: string, name: string, startPos: int32, isMarkdown: boolean): { inner: string; endPos: int32 } | undefined => {
  const openTag = isMarkdown ? "{{%" : "{{<";
  const closeTagPrefix = isMarkdown ? `{{% /${name}` : `{{< /${name}`;
  const closeTagPrefix2 = isMarkdown ? `{{% / ${name}` : `{{< / ${name}`;

  let depth: int32 = 1;
  let pos = startPos;
  const innerStart = startPos;

  while (pos < text.length) {
    const remaining = substringFrom(text, pos);

    if (remaining.startsWith(openTag)) {
      const afterOpen = substringFrom(text, pos + openTag.length).trimStart();
      if (afterOpen.startsWith(name + " ") || afterOpen.startsWith(name + ">") || afterOpen.startsWith(name + "%")) {
        depth++;
      }
    }

    if (remaining.startsWith(closeTagPrefix) || remaining.startsWith(closeTagPrefix2)) {
      depth--;
      if (depth === 0) {
        const inner = substringCount(text, innerStart, pos - innerStart);
        const endSuffix = isMarkdown ? "%}}" : ">}}";
        const closeEnd = indexOfTextFrom(text, endSuffix, pos);
        if (closeEnd < 0) return undefined;
        return { inner, endPos: closeEnd + endSuffix.length };
      }
    }

    pos++;
  }

  return undefined;
};

export const parseShortcodes = (text: string, sourcePath?: string): ShortcodeCall[] => {
  const results: ShortcodeCall[] = [];
  const sourceMap = new ShortcodeSourceMap(text);
  let pos: int32 = 0;

  while (pos < text.length) {
    const openAngle = indexOfTextFrom(text, "{{<", pos);
    const openPercent = indexOfTextFrom(text, "{{%", pos);

    let openPos: int32 = -1;
    let isMarkdown = false;

    if (openAngle >= 0) {
      if (openPercent < 0 || openAngle <= openPercent) {
        openPos = openAngle;
        isMarkdown = false;
      }
    }

    if (openPos < 0 && openPercent >= 0) {
      openPos = openPercent;
      isMarkdown = true;
    }

    if (openPos < 0) break;

    if (sourceMap.isInCodeBlock(openPos)) {
      pos = openPos + 3;
      continue;
    }

    const closeSuffix = isMarkdown ? "%}}" : ">}}";

    const closePos = indexOfTextFrom(text, closeSuffix, openPos + 3);
    if (closePos < 0) {
      const position = sourceMap.positionAt(openPos);
      throw createTsumoError("TSUMO_SHORTCODE_ACTION_UNCLOSED", `Shortcode action opened with '${isMarkdown ? "{{%" : "{{<"}' but is not closed`, sourcePath, position.line, position.column);
    }

    const content = substringCount(text, openPos + 3, closePos - (openPos + 3)).trim();
    const isSelfClosing = content.endsWith("/");
    const tagContent = isSelfClosing
      ? substringCount(content, 0, content.length - 1).trim()
      : content;

    if (tagContent.startsWith("/*")) {
      pos = closePos + closeSuffix.length;
      continue;
    }

    const firstSpace = tagContent.indexOf(" ");
    const name = firstSpace >= 0 ? substringCount(tagContent, 0, firstSpace).trim() : tagContent.trim();
    const argsText = firstSpace >= 0 ? substringFrom(tagContent, firstSpace + 1) : "";

    if (name === "" || name.startsWith("/")) {
      if (name.startsWith("/")) {
        const position = sourceMap.positionAt(openPos);
        throw createTsumoError("TSUMO_SHORTCODE_CLOSE_UNEXPECTED", `Unexpected shortcode closing action '${name}'`, sourcePath, position.line, position.column);
      }
      pos = closePos + closeSuffix.length;
      continue;
    }

    const position = sourceMap.positionAt(openPos);
    const parsed = parseParams(argsText, sourcePath, position.line, position.column);

    if (isSelfClosing === true) {
      const call = new ShortcodeCall(
        name,
        parsed.params,
        parsed.positional,
        parsed.isNamed,
        "",
        isMarkdown,
        true,
        openPos,
        closePos + closeSuffix.length,
        sourcePath,
        position.line,
        position.column,
      );
      results.push(call);
      pos = closePos + closeSuffix.length;
      continue;
    }

    const tagEndPos = closePos + closeSuffix.length;
    const closeResult = findClosingTag(text, name, tagEndPos, isMarkdown);

    if (closeResult !== undefined) {
      const call = new ShortcodeCall(
        name,
        parsed.params,
        parsed.positional,
        parsed.isNamed,
        closeResult.inner,
        isMarkdown,
        false,
        openPos,
        closeResult.endPos,
        sourcePath,
        position.line,
        position.column,
      );
      results.push(call);
      pos = closeResult.endPos;
    } else {
      const call = new ShortcodeCall(
        name,
        parsed.params,
        parsed.positional,
        parsed.isNamed,
        "",
        isMarkdown,
        true,
        openPos,
        tagEndPos,
        sourcePath,
        position.line,
        position.column,
      );
      results.push(call);
      pos = tagEndPos;
    }
  }

  return results;
};

export const collectShortcodeNames = (text: string, sourcePath?: string): Map<string, boolean> => {
  const names = new Map<string, boolean>();
  const pending: string[] = [text];
  for (let pendingIndex: int32 = 0; pendingIndex < pending.length; pendingIndex++) {
    const calls = parseShortcodes(pending[pendingIndex]!, sourcePath);
    for (let callIndex: int32 = 0; callIndex < calls.length; callIndex++) {
      const call = calls[callIndex]!;
      names.set(call.name, true);
      if (call.inner !== "") pending.push(call.inner);
    }
  }
  return names;
};

export const innerDeindent = (inner: string): string => {
  const lines = inner.split("\n");
  if (lines.length === 0) return inner;

  let minIndent: int32 = -1;
  for (let i: int32 = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    let indent: int32 = 0;
    for (let j: int32 = 0; j < line.length; j++) {
      const c = substringCount(line, j, 1);
      if (c === " ") indent++;
      else if (c === "\t") indent += 4;
      else break;
    }
    if (minIndent < 0 || indent < minIndent) minIndent = indent;
  }

  if (minIndent <= 0) return inner;

  const result: string[] = [];
  for (let i: int32 = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      result.push(line);
      continue;
    }
    let removed: int32 = 0;
    let startIdx: int32 = 0;
    for (let j: int32 = 0; j < line.length && removed < minIndent; j++) {
      const c = substringCount(line, j, 1);
      if (c === " ") {
        removed++;
        startIdx++;
      } else if (c === "\t") {
        removed += 4;
        startIdx++;
      } else {
        break;
      }
    }
    result.push(substringFrom(line, startIdx));
  }

  const arr = result;
  let out = "";
  for (let i: int32 = 0; i < arr.length; i++) {
    if (i > 0) out += "\n";
    out += arr[i]!;
  }
  return out;
};
