import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError, TsumoError } from "../../diagnostics.js";
import { ParamKind, ParamValue } from "../../params.js";
import { parseStructuredScalar, stripStructuredComment } from "../../utils/structured-scalars.js";
import {
  AnyArrayValue,
  BoolValue,
  DictValue,
  NumberValue,
  StringValue,
  TemplateValue,
} from "../values.js";

class TomlStatement {
  text: string;
  line: int32;

  constructor(text: string, line: int32) {
    this.text = text;
    this.line = line;
  }
}

const tomlError = (message: string, sourcePath: string | undefined, line: int32): TsumoError =>
  createTsumoError("TSUMO_TEMPLATE_DATA_TOML_INVALID", message, sourcePath, line, 1);

const scalarToTemplateValue = (value: ParamValue): TemplateValue => {
  if (value.kind === ParamKind.Bool) return new BoolValue(value.boolValue);
  if (value.kind === ParamKind.Number) return new NumberValue(value.numberValue);
  return new StringValue(value.stringValue);
};

const statementIsComplete = (text: string): boolean => {
  let squareDepth: int32 = 0;
  let objectDepth: int32 = 0;
  let quote = "";
  let escaped = false;
  for (let index: int32 = 0; index < text.length; index++) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      if (quote === "") quote = character;
      else if (quote === character) quote = "";
      continue;
    }
    if (quote !== "") continue;
    if (character === "[") squareDepth++;
    else if (character === "]") squareDepth--;
    else if (character === "{") objectDepth++;
    else if (character === "}") objectDepth--;
    if (squareDepth < 0 || objectDepth < 0) return true;
  }
  return quote === "" && squareDepth === 0 && objectDepth === 0;
};

const collectTomlStatements = (
  text: string,
  sourcePath: string | undefined,
): TomlStatement[] => {
  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  const statements: TomlStatement[] = [];
  let pending = "";
  let pendingLine: int32 = 0;
  for (let index: int32 = 0; index < lines.length; index++) {
    const line = stripStructuredComment(lines[index]!, "toml").trim();
    if (line === "") continue;
    if (pending === "") {
      pending = line;
      pendingLine = index + 1;
    } else {
      pending += " " + line;
    }
    if (!statementIsComplete(pending)) continue;
    statements.push(new TomlStatement(pending, pendingLine));
    pending = "";
    pendingLine = 0;
  }
  if (pending !== "") throw tomlError("TOML statement is incomplete", sourcePath, pendingLine);
  return statements;
};

const splitTomlKey = (
  text: string,
  sourcePath: string | undefined,
  line: int32,
): string[] => {
  const segments: string[] = [];
  let start: int32 = 0;
  let quote = "";
  let escaped = false;
  for (let index: int32 = 0; index <= text.length; index++) {
    const character = index < text.length ? text[index]! : ".";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      if (quote === "") quote = character;
      else if (quote === character) quote = "";
      continue;
    }
    if (character !== "." || quote !== "") continue;
    const raw = text.slice(start, index).trim();
    if (raw === "") throw tomlError("TOML key segment cannot be empty", sourcePath, line);
    if (raw.startsWith("\"") || raw.startsWith("'")) {
      const parsed = parseStructuredScalar(raw, "toml", (message: string) => tomlError(message, sourcePath, line));
      if (parsed.kind !== ParamKind.String) throw tomlError("Quoted TOML key must be a string", sourcePath, line);
      segments.push(parsed.stringValue);
    } else {
      if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
        throw tomlError(`TOML key segment '${raw}' is invalid`, sourcePath, line);
      }
      segments.push(raw);
    }
    start = index + 1;
  }
  if (quote !== "") throw tomlError("TOML key contains an unterminated quote", sourcePath, line);
  return segments;
};

const assignmentSeparator = (
  text: string,
  sourcePath: string | undefined,
  line: int32,
): int32 => {
  let squareDepth: int32 = 0;
  let objectDepth: int32 = 0;
  let quote = "";
  let escaped = false;
  for (let index: int32 = 0; index < text.length; index++) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      if (quote === "") quote = character;
      else if (quote === character) quote = "";
      continue;
    }
    if (quote !== "") continue;
    if (character === "[") squareDepth++;
    else if (character === "]") squareDepth--;
    else if (character === "{") objectDepth++;
    else if (character === "}") objectDepth--;
    else if (character === "=" && squareDepth === 0 && objectDepth === 0) return index;
  }
  throw tomlError("TOML assignment requires an '=' separator", sourcePath, line);
};

const requireDictionary = (
  value: TemplateValue,
  context: string,
  sourcePath: string | undefined,
  line: int32,
): DictValue => {
  if (value instanceof DictValue) return value as DictValue;
  throw tomlError(`${context} conflicts with a non-table value`, sourcePath, line);
};

const ensureDictionaryPath = (
  root: DictValue,
  segments: string[],
  sourcePath: string | undefined,
  line: int32,
): DictValue => {
  let current = root;
  for (let index: int32 = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const existing = current.value.get(segment);
    if (existing === undefined) {
      const created = new DictValue(new Map<string, TemplateValue>());
      current.value.set(segment, created);
      current = created;
      continue;
    }
    current = requireDictionary(existing, `TOML table '${segments.join(".")}'`, sourcePath, line);
  }
  return current;
};

const setTomlValue = (
  table: DictValue,
  key: string[],
  value: TemplateValue,
  sourcePath: string | undefined,
  line: int32,
): void => {
  const parentSegments: string[] = [];
  for (let index: int32 = 0; index < key.length - 1; index++) parentSegments.push(key[index]!);
  const parent = ensureDictionaryPath(table, parentSegments, sourcePath, line);
  const name = key[key.length - 1]!;
  if (parent.value.has(name)) {
    throw tomlError(`TOML key '${key.join(".")}' is declared more than once`, sourcePath, line);
  }
  parent.value.set(name, value);
};

class TomlValueReader {
  text: string;
  index: int32;
  sourcePath: string | undefined;
  line: int32;

  constructor(text: string, sourcePath: string | undefined, line: int32) {
    this.text = text;
    this.index = 0;
    this.sourcePath = sourcePath;
    this.line = line;
  }

  parse(): TemplateValue {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) throw this.error("Unexpected trailing TOML value content");
    return value;
  }

  parseValue(): TemplateValue {
    this.skipWhitespace();
    const character = this.peek();
    if (character === "\"" || character === "'") return this.parseString();
    if (character === "[") return this.parseArray();
    if (character === "{") return this.parseInlineTable();
    return this.parseBareScalar();
  }

  parseString(): TemplateValue {
    const start = this.index;
    const quote = this.next();
    if (this.peek() === quote && this.index + 1 < this.text.length && this.text[this.index + 1] === quote) {
      throw this.error("Multiline TOML strings are not supported by the data contract");
    }
    let escaped = false;
    while (this.index < this.text.length) {
      const character = this.next();
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote === "\"" && character === "\\") {
        escaped = true;
        continue;
      }
      if (character !== quote) continue;
      const raw = this.text.slice(start, this.index);
      const sourcePath = this.sourcePath;
      const line = this.line;
      return scalarToTemplateValue(
        parseStructuredScalar(raw, "toml", (message: string) => tomlError(message, sourcePath, line)),
      );
    }
    throw this.error("TOML string is unterminated");
  }

  parseArray(): TemplateValue {
    this.expect("[");
    const items: TemplateValue[] = [];
    this.skipWhitespace();
    if (this.peek() === "]") {
      this.index++;
      return new AnyArrayValue(items);
    }
    while (true) {
      items.push(this.parseValue());
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "]") {
        this.index++;
        return new AnyArrayValue(items);
      }
      if (separator !== ",") throw this.error("TOML array entries must be separated by commas");
      this.index++;
      this.skipWhitespace();
      if (this.peek() === "]") {
        this.index++;
        return new AnyArrayValue(items);
      }
    }
  }

  parseInlineTable(): TemplateValue {
    this.expect("{");
    const fields = new DictValue(new Map<string, TemplateValue>());
    this.skipWhitespace();
    if (this.peek() === "}") {
      this.index++;
      return fields;
    }
    while (true) {
      const keyStart = this.index;
      let quote = "";
      let escaped = false;
      while (this.index < this.text.length) {
        const character = this.peek();
        if (escaped) {
          escaped = false;
          this.index++;
          continue;
        }
        if (quote === "\"" && character === "\\") {
          escaped = true;
          this.index++;
          continue;
        }
        if (character === "\"" || character === "'") {
          if (quote === "") quote = character;
          else if (quote === character) quote = "";
          this.index++;
          continue;
        }
        if (character === "=" && quote === "") break;
        this.index++;
      }
      if (this.peek() !== "=") throw this.error("TOML inline table entry requires '='");
      const key = splitTomlKey(this.text.slice(keyStart, this.index).trim(), this.sourcePath, this.line);
      this.index++;
      setTomlValue(fields, key, this.parseValue(), this.sourcePath, this.line);
      this.skipWhitespace();
      const separator = this.peek();
      if (separator === "}") {
        this.index++;
        return fields;
      }
      if (separator !== ",") throw this.error("TOML inline table entries must be separated by commas");
      this.index++;
      this.skipWhitespace();
      if (this.peek() === "}") throw this.error("TOML inline tables do not allow a trailing comma");
    }
  }

  parseBareScalar(): TemplateValue {
    const start = this.index;
    while (this.index < this.text.length) {
      const character = this.peek();
      if (character === "," || character === "]" || character === "}" || /\s/.test(character)) break;
      this.index++;
    }
    const raw = this.text.slice(start, this.index).trim();
    if (raw === "") throw this.error("TOML value cannot be empty");
    const sourcePath = this.sourcePath;
    const line = this.line;
    try {
      return scalarToTemplateValue(
        parseStructuredScalar(raw, "toml", (message: string) => tomlError(message, sourcePath, line)),
      );
    } catch (error) {
      if (
        /^\d{4}-\d{2}-\d{2}(?:[Tt ][0-9:.+-]+[Zz]?)?$/.test(raw) ||
        /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
      ) {
        return new StringValue(raw);
      }
      throw error;
    }
  }

  skipWhitespace(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index]!)) this.index++;
  }

  peek(): string {
    return this.index < this.text.length ? this.text[this.index]! : "";
  }

  next(): string {
    if (this.index >= this.text.length) throw this.error("Unexpected end of TOML value");
    return this.text[this.index++]!;
  }

  expect(character: string): void {
    if (this.next() !== character) throw this.error(`Expected '${character}'`);
  }

  error(message: string): TsumoError {
    return tomlError(message, this.sourcePath, this.line);
  }
}

export const parseTomlTemplateData = (
  text: string,
  sourcePath?: string,
): DictValue => {
  const root = new DictValue(new Map<string, TemplateValue>());
  let currentTable = root;
  const declaredTables = new Set<string>();
  const statements = collectTomlStatements(text, sourcePath);
  for (let index: int32 = 0; index < statements.length; index++) {
    const statement = statements[index]!;
    const raw = statement.text.trim();
    if (raw.startsWith("[[") && raw.endsWith("]]")) {
      const path = splitTomlKey(raw.slice(2, raw.length - 2).trim(), sourcePath, statement.line);
      if (path.length === 0) throw tomlError("TOML array table name cannot be empty", sourcePath, statement.line);
      const parentSegments: string[] = [];
      for (let pathIndex: int32 = 0; pathIndex < path.length - 1; pathIndex++) {
        parentSegments.push(path[pathIndex]!);
      }
      const parent = ensureDictionaryPath(root, parentSegments, sourcePath, statement.line);
      const name = path[path.length - 1]!;
      const existing = parent.value.get(name);
      let entries: AnyArrayValue;
      if (existing === undefined) {
        entries = new AnyArrayValue([]);
        parent.value.set(name, entries);
      } else if (existing instanceof AnyArrayValue) {
        entries = existing as AnyArrayValue;
      } else {
        throw tomlError(`TOML array table '${path.join(".")}' conflicts with another value`, sourcePath, statement.line);
      }
      currentTable = new DictValue(new Map<string, TemplateValue>());
      entries.value.push(currentTable);
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const path = splitTomlKey(raw.slice(1, raw.length - 1).trim(), sourcePath, statement.line);
      const identity = path.join(".");
      if (declaredTables.has(identity)) {
        throw tomlError(`TOML table '${identity}' is declared more than once`, sourcePath, statement.line);
      }
      declaredTables.add(identity);
      currentTable = ensureDictionaryPath(root, path, sourcePath, statement.line);
      continue;
    }

    const separator = assignmentSeparator(raw, sourcePath, statement.line);
    const key = splitTomlKey(raw.slice(0, separator).trim(), sourcePath, statement.line);
    const valueText = raw.slice(separator + 1).trim();
    const value = new TomlValueReader(valueText, sourcePath, statement.line).parse();
    setTomlValue(currentTable, key, value, sourcePath, statement.line);
  }
  return root;
};
