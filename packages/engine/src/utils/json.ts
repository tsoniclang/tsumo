import type { int32 } from "@tsonic/core/types.js";
import { Char } from "@tsonic/dotnet/System.js";
import { createTsumoError, TsumoError } from "../diagnostics.js";
import { IndexedSourceText } from "./indexed-source-text.js";
import { compareText, indexOfText } from "./strings.js";

export class JsonValue {
  kind: string;
  line: int32;
  column: int32;

  constructor(kind: string, line: int32, column: int32) {
    this.kind = kind;
    this.line = line;
    this.column = column;
  }
}

export class JsonNull extends JsonValue {
  value: null;

  constructor(line: int32, column: int32) {
    super("null", line, column);
    this.value = null;
  }
}

export class JsonBool extends JsonValue {
  value: boolean;

  constructor(value: boolean, line: int32, column: int32) {
    super("bool", line, column);
    this.value = value;
  }
}

export class JsonNumber extends JsonValue {
  value: number;

  constructor(value: number, line: int32, column: int32) {
    super("number", line, column);
    this.value = value;
  }
}

export class JsonString extends JsonValue {
  value: string;

  constructor(value: string, line: int32, column: int32) {
    super("string", line, column);
    this.value = value;
  }
}

export class JsonArray extends JsonValue {
  items: JsonValue[];

  constructor(items: JsonValue[], line: int32, column: int32) {
    super("array", line, column);
    this.items = items;
  }
}

export class JsonProperty {
  key: string;
  value: JsonValue;
  line: int32;
  column: int32;

  constructor(key: string, value: JsonValue, line: int32, column: int32) {
    this.key = key;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

export class JsonObject extends JsonValue {
  properties: JsonProperty[];

  constructor(properties: JsonProperty[], line: int32, column: int32) {
    super("object", line, column);
    this.properties = properties;
  }

  get(name: string): JsonValue | undefined {
    for (let i = 0; i < this.properties.length; i++) {
      const property = this.properties[i]!;
      if (property.key === name) return property.value;
    }
    return undefined;
  }

  getCaseInsensitive(name: string): JsonValue | undefined {
    const lowered = name.toLowerCase();
    for (let i = 0; i < this.properties.length; i++) {
      const property = this.properties[i]!;
      if (property.key.toLowerCase() === lowered) return property.value;
    }
    return undefined;
  }
}

class JsonParser {
  source: IndexedSourceText;
  index: int32;
  sourcePath: string | undefined;
  lineStarts: int32[];
  depth: int32;

  constructor(text: string, sourcePath?: string) {
    this.source = new IndexedSourceText(text);
    this.index = 0;
    this.sourcePath = sourcePath;
    this.lineStarts = [0];
    this.depth = 0;
    for (let position: int32 = 0; position < this.source.length; position++) {
      const current = this.source.characterAt(position);
      if (current === "\n") this.lineStarts.push(position + 1);
      else if (current === "\r") {
        if (position + 1 < this.source.length && this.source.characterAt(position + 1) === "\n") position++;
        this.lineStarts.push(position + 1);
      }
    }
  }

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      throw this.syntaxError("Unexpected trailing JSON content");
    }
    return value;
  }

  parseValue(): JsonValue {
    this.skipWhitespace();
    const start = this.index;
    const line = this.lineAt(start);
    const column = this.columnAt(start);
    const ch = this.peek();
    if (ch === "{") return this.parseObject();
    if (ch === "[") return this.parseArray();
    if (ch === "\"") return new JsonString(this.parseString(), line, column);
    if (ch === "t") {
      this.expectKeyword("true");
      return new JsonBool(true, line, column);
    }
    if (ch === "f") {
      this.expectKeyword("false");
      return new JsonBool(false, line, column);
    }
    if (ch === "n") {
      this.expectKeyword("null");
      return new JsonNull(line, column);
    }
    if (ch === "-" || this.isDigit(ch)) return this.parseNumber(line, column);
    throw this.syntaxError("Invalid JSON value", start);
  }

  parseObject(): JsonObject {
    const start = this.index;
    const line = this.lineAt(start);
    const column = this.columnAt(start);
    this.enterComposite(start);
    this.expect("{");
    this.skipWhitespace();
    const properties: JsonProperty[] = [];
    const propertyNames = new Set<string>();
    if (this.peek() === "}") {
      this.index++;
      this.depth--;
      return new JsonObject(properties, line, column);
    }

    while (true) {
      this.skipWhitespace();
      const keyStart = this.index;
      const key = this.parseString();
      if (propertyNames.has(key)) {
        throw this.error("TSUMO_JSON_DUPLICATE_PROPERTY", `JSON property '${key}' is declared more than once`, keyStart);
      }
      propertyNames.add(key);
      this.skipWhitespace();
      this.expect(":");
      const value = this.parseValue();
      properties.push(new JsonProperty(key, value, this.lineAt(keyStart), this.columnAt(keyStart)));
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "}") {
        this.index++;
        break;
      }
      if (separator !== ",") throw this.syntaxError("Expected ',' or '}' after JSON object property");
      this.index++;
    }

    this.depth--;
    return new JsonObject(properties, line, column);
  }

  parseArray(): JsonArray {
    const start = this.index;
    const line = this.lineAt(start);
    const column = this.columnAt(start);
    this.enterComposite(start);
    this.expect("[");
    this.skipWhitespace();
    const items: JsonValue[] = [];
    if (this.peek() === "]") {
      this.index++;
      this.depth--;
      return new JsonArray(items, line, column);
    }

    while (true) {
      items.push(this.parseValue());
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "]") {
        this.index++;
        break;
      }
      if (separator !== ",") throw this.syntaxError("Expected ',' or ']' after JSON array item");
      this.index++;
    }

    this.depth--;
    return new JsonArray(items, line, column);
  }

  parseString(): string {
    this.expect("\"");
    let result = "";
    while (this.index < this.source.length) {
      const ch = this.next();
      if (ch === "\"") return result;
      if (ch !== "\\") {
        if (compareText(ch, " ") < 0) throw this.syntaxError("JSON strings cannot contain unescaped control characters", this.index - 1);
        result += ch;
        continue;
      }

      const escaped = this.next();
      if (escaped === "\"" || escaped === "\\" || escaped === "/") result += escaped;
      else if (escaped === "b") result += "\b";
      else if (escaped === "f") result += "\f";
      else if (escaped === "n") result += "\n";
      else if (escaped === "r") result += "\r";
      else if (escaped === "t") result += "\t";
      else if (escaped === "u") result += this.parseUnicodeEscape();
      else throw this.syntaxError("Invalid JSON string escape", this.index - 1);
    }
    throw this.syntaxError("Unterminated JSON string");
  }

  parseUnicodeEscape(): string {
    const first = this.parseUnicodeCodeUnit();
    if (first >= 0xd800 && first <= 0xdbff) {
      if (this.index + 6 > this.source.length || this.source.characterAt(this.index) !== "\\" || this.source.characterAt(this.index + 1) !== "u") {
        throw this.syntaxError("A high-surrogate JSON escape must be followed by a low-surrogate escape");
      }
      this.index += 2;
      const second = this.parseUnicodeCodeUnit();
      if (second < 0xdc00 || second > 0xdfff) {
        throw this.syntaxError("A high-surrogate JSON escape must be followed by a low-surrogate escape", this.index - 4);
      }
      const codePoint = 0x10000 + (first - 0xd800) * 0x400 + second - 0xdc00;
      return Char.ConvertFromUtf32(codePoint);
    }
    if (first >= 0xdc00 && first <= 0xdfff) {
      throw this.syntaxError("A low-surrogate JSON escape requires a preceding high-surrogate escape", this.index - 4);
    }
    return Char.ConvertFromUtf32(first);
  }

  parseUnicodeCodeUnit(): int32 {
    if (this.index + 4 > this.source.length) throw this.syntaxError("JSON unicode escapes require four hexadecimal digits");
    let value: int32 = 0;
    for (let offset: int32 = 0; offset < 4; offset++) {
      const ch = this.source.characterAt(this.index + offset).toLowerCase();
      const digit = indexOfText("0123456789abcdef", ch);
      if (digit < 0) throw this.syntaxError("JSON unicode escapes require hexadecimal digits", this.index + offset);
      value = value * 16 + digit;
    }
    this.index += 4;
    return value;
  }

  parseNumber(line: int32, column: int32): JsonNumber {
    const start = this.index;
    if (this.peek() === "-") this.index++;
    if (this.peek() === "0") {
      this.index++;
      if (this.isDigit(this.peek())) throw this.syntaxError("JSON numbers cannot contain leading zeroes");
    } else {
      this.consumeDigits();
    }
    if (this.peek() === ".") {
      this.index++;
      this.consumeDigits();
    }
    const exponent = this.peek();
    if (exponent === "e" || exponent === "E") {
      this.index++;
      const sign = this.peek();
      if (sign === "+" || sign === "-") this.index++;
      this.consumeDigits();
    }
    const raw = this.source.slice(start, this.index);
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) throw this.syntaxError("JSON number is outside the supported finite range", start);
    return new JsonNumber(value, line, column);
  }

  consumeDigits(): void {
    const start = this.index;
    while (this.isDigit(this.peek())) this.index++;
    if (this.index === start) throw this.syntaxError("Expected JSON digit");
  }

  expectKeyword(keyword: string): void {
    for (let offset: int32 = 0; offset < keyword.length; offset++) {
      if (this.source.characterAt(this.index + offset) !== keyword[offset]) {
        throw this.syntaxError(`Invalid JSON keyword; expected '${keyword}'`);
      }
    }
    this.index += keyword.length;
  }

  expect(expected: string): void {
    if (this.next() !== expected) throw this.syntaxError(`Invalid JSON token; expected '${expected}'`, this.index - 1);
  }

  next(): string {
    if (this.index >= this.source.length) throw this.syntaxError("Unexpected end of JSON");
    const ch = this.source.characterAt(this.index);
    this.index++;
    return ch;
  }

  peek(): string {
    if (this.index >= this.source.length) return "";
    return this.source.characterAt(this.index);
  }

  skipWhitespace(): void {
    while (true) {
      const ch = this.peek();
      if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") return;
      this.index++;
    }
  }

  isDigit(ch: string): boolean {
    return compareText(ch, "0") >= 0 && compareText(ch, "9") <= 0;
  }

  enterComposite(index: int32): void {
    this.depth++;
    if (this.depth > 256) {
      throw this.error("TSUMO_JSON_DEPTH_EXCEEDED", "JSON nesting exceeds the supported depth of 256", index);
    }
  }

  lineIndexAt(index: int32): int32 {
    let low: int32 = 0;
    let high: int32 = this.lineStarts.length;
    while (low < high) {
      const middle = (low + Math.floor((high - low) / 2)) as int32;
      if (this.lineStarts[middle]! <= index) low = middle + 1;
      else high = middle;
    }
    return low - 1;
  }

  lineAt(index: int32): int32 {
    return this.lineIndexAt(index) + 1;
  }

  columnAt(index: int32): int32 {
    const lineIndex = this.lineIndexAt(index);
    return this.source.utf16OffsetAt(index) - this.source.utf16OffsetAt(this.lineStarts[lineIndex]!) + 1;
  }

  syntaxError(message: string, index?: int32): TsumoError {
    return this.error("TSUMO_JSON_SYNTAX_INVALID", message, index ?? this.index);
  }

  error(code: string, message: string, index: int32): TsumoError {
    return createTsumoError(code, message, this.sourcePath, this.lineAt(index), this.columnAt(index));
  }
}

export const parseJson = (text: string, sourcePath?: string): JsonValue => new JsonParser(text, sourcePath).parse();

export const jsonString = (value: JsonValue | undefined): string | undefined =>
  value instanceof JsonString ? value.value : undefined;

export const jsonBool = (value: JsonValue | undefined): boolean | undefined =>
  value instanceof JsonBool ? value.value : undefined;

export const jsonNumber = (value: JsonValue | undefined): number | undefined =>
  value instanceof JsonNumber ? value.value : undefined;

export const jsonArray = (value: JsonValue | undefined): JsonArray | undefined =>
  value instanceof JsonArray ? (value as JsonArray) : undefined;

export const jsonObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value instanceof JsonObject ? (value as JsonObject) : undefined;
