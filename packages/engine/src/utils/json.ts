import type { int } from "@tsonic/core/types.js";

export class JsonValue {
  kind: string;

  constructor(kind: string) {
    this.kind = kind;
  }
}

export class JsonNull extends JsonValue {
  value: null;

  constructor() {
    super("null");
    this.value = null;
  }
}

export class JsonBool extends JsonValue {
  value: boolean;

  constructor(value: boolean) {
    super("bool");
    this.value = value;
  }
}

export class JsonNumber extends JsonValue {
  value: number;

  constructor(value: number) {
    super("number");
    this.value = value;
  }
}

export class JsonString extends JsonValue {
  value: string;

  constructor(value: string) {
    super("string");
    this.value = value;
  }
}

export class JsonArray extends JsonValue {
  items: JsonValue[];

  constructor(items: JsonValue[]) {
    super("array");
    this.items = items;
  }
}

export class JsonProperty {
  key: string;
  value: JsonValue;

  constructor(key: string, value: JsonValue) {
    this.key = key;
    this.value = value;
  }
}

export class JsonObject extends JsonValue {
  properties: JsonProperty[];

  constructor(properties: JsonProperty[]) {
    super("object");
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
  text: string;
  index: int;

  constructor(text: string) {
    this.text = text;
    this.index = 0;
  }

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      throw new Error("Unexpected trailing JSON content");
    }
    return value;
  }

  parseValue(): JsonValue {
    this.skipWhitespace();
    const ch = this.peek();
    if (ch === "{") return this.parseObject();
    if (ch === "[") return this.parseArray();
    if (ch === "\"") return new JsonString(this.parseString());
    if (ch === "t") {
      this.expectKeyword("true");
      return new JsonBool(true);
    }
    if (ch === "f") {
      this.expectKeyword("false");
      return new JsonBool(false);
    }
    if (ch === "n") {
      this.expectKeyword("null");
      return new JsonNull();
    }
    if (ch === "-" || this.isDigit(ch)) return this.parseNumber();
    throw new Error("Invalid JSON value");
  }

  parseObject(): JsonObject {
    this.expect("{");
    this.skipWhitespace();
    const properties: JsonProperty[] = [];
    if (this.peek() === "}") {
      this.index++;
      return new JsonObject(properties);
    }

    while (true) {
      this.skipWhitespace();
      const key = this.parseString();
      this.skipWhitespace();
      this.expect(":");
      const value = this.parseValue();
      properties.push(new JsonProperty(key, value));
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "}") {
        this.index++;
        break;
      }
      if (separator !== ",") throw new Error("Expected JSON object separator");
      this.index++;
    }

    return new JsonObject(properties);
  }

  parseArray(): JsonArray {
    this.expect("[");
    this.skipWhitespace();
    const items: JsonValue[] = [];
    if (this.peek() === "]") {
      this.index++;
      return new JsonArray(items);
    }

    while (true) {
      items.push(this.parseValue());
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "]") {
        this.index++;
        break;
      }
      if (separator !== ",") throw new Error("Expected JSON array separator");
      this.index++;
    }

    return new JsonArray(items);
  }

  parseString(): string {
    this.expect("\"");
    let result = "";
    while (this.index < this.text.length) {
      const ch = this.next();
      if (ch === "\"") return result;
      if (ch !== "\\") {
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
      else throw new Error("Invalid JSON string escape");
    }
    throw new Error("Unterminated JSON string");
  }

  parseUnicodeEscape(): string {
    if (this.index + 4 > this.text.length) {
      throw new Error("Invalid JSON unicode escape");
    }
    this.index += 4;
    throw new Error("JSON unicode escapes are not supported");
  }

  parseNumber(): JsonNumber {
    const start = this.index;
    if (this.peek() === "-") this.index++;
    this.consumeDigits();
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
    const raw = this.text.substring(start, this.index);
    const value = parseFloat(raw);
    if (Number.isNaN(value)) throw new Error("Invalid JSON number");
    return new JsonNumber(value);
  }

  consumeDigits(): void {
    const start = this.index;
    while (this.isDigit(this.peek())) this.index++;
    if (this.index === start) throw new Error("Expected JSON digit");
  }

  expectKeyword(keyword: string): void {
    if (this.text.substring(this.index, this.index + keyword.length) !== keyword) {
      throw new Error("Invalid JSON keyword");
    }
    this.index += keyword.length;
  }

  expect(expected: string): void {
    if (this.next() !== expected) throw new Error("Invalid JSON token");
  }

  next(): string {
    if (this.index >= this.text.length) throw new Error("Unexpected end of JSON");
    const ch = this.text[this.index]!;
    this.index++;
    return ch;
  }

  peek(): string {
    if (this.index >= this.text.length) return "";
    return this.text[this.index]!;
  }

  skipWhitespace(): void {
    while (true) {
      const ch = this.peek();
      if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") return;
      this.index++;
    }
  }

  isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }
}

export const parseJson = (text: string): JsonValue => new JsonParser(text).parse();

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
