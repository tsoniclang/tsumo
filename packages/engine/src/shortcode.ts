import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { indexOfText, indexOfTextFrom, lastIndexOfText } from "./utils/strings.ts";
import { ParamValue } from "./params.ts";

export class ShortcodeCall {
  readonly name: string;
  readonly params: Dictionary<string, ParamValue>;
  readonly positionalParams: string[];
  readonly isNamedParams: boolean;
  readonly inner: string;
  readonly isMarkdown: boolean;
  readonly isSelfClosing: boolean;
  readonly startIndex: int;
  readonly endIndex: int;

  constructor(
    name: string,
    params: Dictionary<string, ParamValue>,
    positionalParams: string[],
    isNamedParams: boolean,
    inner: string,
    isMarkdown: boolean,
    isSelfClosing: boolean,
    startIndex: int,
    endIndex: int,
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
  }
}

class ParseState {
  text: string;
  pos: int;

  constructor(text: string) {
    this.text = text;
    this.pos = 0;
  }

  peek(offset: int): string {
    const idx = this.pos + offset;
    return idx < this.text.length ? this.text.substring(idx, idx + 1) : "";
  }

  peekString(length: int): string {
    const endPos = this.pos + length;
    const end = endPos < this.text.length ? endPos : this.text.length;
    return this.text.substring(this.pos, end);
  }

  advance(count: int): void {
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

const isInCodeBlock = (text: string, pos: int): boolean => {
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let i = 0;

  while (i < pos) {
    const c = text.substring(i, i + 1);

    if (!inFence && (c === "`" || c === "~")) {
      let len = 1;
      while (i + len < text.length && text.substring(i + len, i + len + 1) === c) len++;
      if (len >= 3) {
        inFence = true;
        fenceChar = c;
        fenceLen = len;
        i += len;
        while (i < text.length && text.substring(i, i + 1) !== "\n") i++;
        continue;
      }
    }

    if (inFence && c === fenceChar) {
      let len = 1;
      while (i + len < text.length && text.substring(i + len, i + len + 1) === c) len++;
      if (len >= fenceLen) {
        inFence = false;
        fenceChar = "";
        fenceLen = 0;
        i += len;
        continue;
      }
    }

    i++;
  }

  return inFence;
};

const parseQuotedString = (state: ParseState): string => {
  const quote = state.peek(0);
  if (quote !== "\"" && quote !== "'") return "";
  state.advance(1);

  let result = "";
  while (!state.atEnd()) {
    const c = state.peek(0);
    if (c === quote) {
      state.advance(1);
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

const parseParams = (argsText: string): { params: Dictionary<string, ParamValue>; positional: string[]; isNamed: boolean } => {
  const params = new Dictionary<string, ParamValue>();
  const positional = new List<string>();
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

    const startPos = state.pos;
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
      isNamed = true;
      state.skipWhitespace();
      const q = state.peek(0);
      if (q === "\"" || q === "'") {
        value = parseQuotedString(state);
      } else {
        value = parseUnquotedValue(state);
      }
      params.remove(key);
      params.add(key, ParamValue.parseScalar(value));
    } else {
      if (key === "" && (state.peek(0) === "\"" || state.peek(0) === "'")) {
        key = parseQuotedString(state);
      }
      if (key !== "") {
        positional.add(key);
      }
    }
  }

  return { params, positional: positional.toArray(), isNamed };
};

const findClosingTag = (text: string, name: string, startPos: int, isMarkdown: boolean): { inner: string; endPos: int } | undefined => {
  const openTag = isMarkdown ? "{{%" : "{{<";
  const closeTagPrefix = isMarkdown ? `{{% /${name}` : `{{< /${name}`;
  const closeTagPrefix2 = isMarkdown ? `{{% / ${name}` : `{{< / ${name}`;

  let depth = 1;
  let pos = startPos;
  let innerStart = startPos;

  while (pos < text.length) {
    const remaining = text.substring(pos);

    if (remaining.startsWith(openTag)) {
      const afterOpen = text.substring(pos + openTag.length).trimStart();
      if (afterOpen.startsWith(name + " ") || afterOpen.startsWith(name + ">") || afterOpen.startsWith(name + "%")) {
        depth++;
      }
    }

    if (remaining.startsWith(closeTagPrefix) || remaining.startsWith(closeTagPrefix2)) {
      depth--;
      if (depth === 0) {
        const inner = text.substring(innerStart, pos);
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

export const parseShortcodes = (text: string): ShortcodeCall[] => {
  const results = new List<ShortcodeCall>();
  let pos = 0;

  while (pos < text.length) {
    const openAngle = indexOfTextFrom(text, "{{<", pos);
    const openPercent = indexOfTextFrom(text, "{{%", pos);

    let openPos: int = -1;
    let isMarkdown = false;

    if (openAngle >= 0 && (openPercent < 0 || openAngle <= openPercent)) {
      openPos = openAngle;
      isMarkdown = false;
    } else if (openPercent >= 0) {
      openPos = openPercent;
      isMarkdown = true;
    }

    if (openPos < 0) break;

    if (isInCodeBlock(text, openPos)) {
      pos = openPos + 3;
      continue;
    }

    const after3 = text.substring(openPos + 3, openPos + 4);
    if (after3 === "*") {
      pos = openPos + 4;
      continue;
    }

    if (after3 === " ") {
      pos = openPos + 3;
      continue;
    }

    const closeSuffix = isMarkdown ? "%}}" : ">}}";
    const selfCloseSuffix = isMarkdown ? "/%}}" : "/>}}";

    let closePos = indexOfTextFrom(text, closeSuffix, openPos + 3);
    if (closePos < 0) {
      pos = openPos + 3;
      continue;
    }

    const content = text.substring(openPos + 3, closePos);

    const selfClosePattern = isMarkdown ? "/%" : "/>";
    const selfCloseIdx = lastIndexOfText(content, selfClosePattern);
    const isSelfClosing = selfCloseIdx >= 0 && content.substring(selfCloseIdx).trim() === selfClosePattern;

    let tagContent = content;
    if (isSelfClosing) {
      tagContent = content.substring(0, selfCloseIdx).trim();
    }

    const firstSpace = tagContent.indexOf(" ");
    const name = firstSpace >= 0 ? tagContent.substring(0, firstSpace).trim() : tagContent.trim();
    const argsText = firstSpace >= 0 ? tagContent.substring(firstSpace + 1) : "";

    if (name === "" || name.startsWith("/")) {
      pos = closePos + closeSuffix.length;
      continue;
    }

    const parsed = parseParams(argsText);

    if (isSelfClosing) {
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
      );
      results.add(call);
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
      );
      results.add(call);
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
      );
      results.add(call);
      pos = tagEndPos;
    }
  }

  return results.toArray();
};

export const innerDeindent = (inner: string): string => {
  const lines = inner.split("\n");
  if (lines.length === 0) return inner;

  let minIndent: int = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    let indent = 0;
    for (let j = 0; j < line.length; j++) {
      const c = line.substring(j, j + 1);
      if (c === " ") indent++;
      else if (c === "\t") indent += 4;
      else break;
    }
    if (minIndent < 0 || indent < minIndent) minIndent = indent;
  }

  if (minIndent <= 0) return inner;

  const result = new List<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      result.add(line);
      continue;
    }
    let removed = 0;
    let startIdx = 0;
    for (let j = 0; j < line.length && removed < minIndent; j++) {
      const c = line.substring(j, j + 1);
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
    result.add(line.substring(startIdx));
  }

  const arr = result.toArray();
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    if (i > 0) out += "\n";
    out += arr[i]!;
  }
  return out;
};
