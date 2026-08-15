import { extname } from "node:path";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError, TsumoError } from "../../diagnostics.js";
import { ParamKind } from "../../params.js";
import {
  JsonArray,
  JsonBool,
  JsonNull,
  JsonNumber,
  JsonObject,
  JsonString,
  JsonValue,
  parseJson,
} from "../../utils/json.js";
import { parseStructuredScalar, stripStructuredComment } from "../../utils/structured-scalars.js";
import { substringFrom } from "../../utils/strings.js";
import {
  AnyArrayValue,
  BoolValue,
  DictValue,
  HtmlValue,
  NumberValue,
  ResourceValue,
  StringValue,
  TemplateValue,
} from "../values.js";
import { nil, toPlainString } from "../runtime-helpers.js";

class StructuredInput {
  text: string;
  sourcePath: string | undefined;
  formatHint: string | undefined;

  constructor(text: string, sourcePath?: string, formatHint?: string) {
    this.text = text;
    this.sourcePath = sourcePath;
    this.formatHint = formatHint;
  }
}

class YamlLine {
  indent: int32;
  content: string;
  lineNumber: int32;

  constructor(indent: int32, content: string, lineNumber: int32) {
    this.indent = indent;
    this.content = content;
    this.lineNumber = lineNumber;
  }
}

class YamlParseResult {
  value: TemplateValue;
  nextIndex: int32;

  constructor(value: TemplateValue, nextIndex: int32) {
    this.value = value;
    this.nextIndex = nextIndex;
  }
}

const jsonToTemplateValue = (value: JsonValue): TemplateValue => {
  if (value instanceof JsonNull) return nil;
  if (value instanceof JsonBool) return new BoolValue(value.value);
  if (value instanceof JsonNumber) {
    if (!Number.isInteger(value.value) || value.value < -2147483648 || value.value > 2147483647) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_UNMARSHAL_NUMBER_UNSUPPORTED",
        "Structured template data currently requires 32-bit integer numbers",
        undefined,
        value.line,
        value.column,
      );
    }
    return new NumberValue(value.value as int32);
  }
  if (value instanceof JsonString) return new StringValue(value.value);
  if (value instanceof JsonArray) {
    const items: TemplateValue[] = [];
    for (let index = 0; index < value.items.length; index++) {
      items.push(jsonToTemplateValue(value.items[index]!));
    }
    return new AnyArrayValue(items);
  }
  if (value instanceof JsonObject) {
    const fields = new Map<string, TemplateValue>();
    for (let index = 0; index < value.properties.length; index++) {
      const property = value.properties[index]!;
      fields.set(property.key, jsonToTemplateValue(property.value));
    }
    return new DictValue(fields);
  }
  throw createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_VALUE_INVALID", "Structured data contains an unknown value kind");
};

class YamlTemplateParser {
  lines: YamlLine[];
  sourcePath: string | undefined;

  constructor(text: string, sourcePath?: string) {
    this.lines = [];
    this.sourcePath = sourcePath;
    const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const sourceLines = normalized.split("\n");
    for (let index = 0; index < sourceLines.length; index++) {
      const raw = sourceLines[index]!;
      let indent: int32 = 0;
      while (indent < raw.length && raw[indent] === " ") indent++;
      if (indent < raw.length && raw[indent] === "\t") {
        throw createTsumoError(
          "TSUMO_TEMPLATE_UNMARSHAL_YAML_INVALID",
          "YAML indentation cannot contain tabs",
          sourcePath,
          index + 1,
          1,
        );
      }
      const content = stripStructuredComment(substringFrom(raw, indent), "yaml").trimEnd();
      if (content.trim() === "" || content.trim() === "---" || content.trim() === "...") continue;
      this.lines.push(new YamlLine(indent, content, index + 1));
    }
  }

  parse(): TemplateValue {
    if (this.lines.length === 0) return nil;
    const result = this.parseBlock(0, this.lines[0]!.indent);
    if (result.nextIndex !== this.lines.length) {
      const line = this.lines[result.nextIndex]!;
      throw this.error("YAML indentation does not belong to the preceding value", line.lineNumber);
    }
    return result.value;
  }

  parseBlock(index: int32, indent: int32): YamlParseResult {
    const line = this.lines[index]!;
    if (line.indent !== indent) throw this.error("YAML block indentation is inconsistent", line.lineNumber);
    return line.content === "-" || line.content.startsWith("- ")
      ? this.parseSequence(index, indent)
      : this.parseMapping(index, indent);
  }

  parseSequence(index: int32, indent: int32): YamlParseResult {
    const values: TemplateValue[] = [];
    let current = index;
    while (current < this.lines.length) {
      const line = this.lines[current]!;
      if (line.indent < indent) break;
      if (line.indent !== indent || (line.content !== "-" && !line.content.startsWith("- "))) {
        throw this.error("YAML sequence entries must use the same indentation and '-' marker", line.lineNumber);
      }
      const item = line.content === "-" ? "" : substringFrom(line.content, 2).trim();
      current++;
      if (item !== "") {
        if (this.mappingSeparator(item) >= 0) {
          throw this.error(
            "YAML sequence mappings are not supported by the current template data contract",
            line.lineNumber,
          );
        }
        values.push(this.parseScalar(item, line.lineNumber));
        if (current < this.lines.length && this.lines[current]!.indent > indent) {
          throw this.error("A scalar YAML sequence entry cannot own an indented block", this.lines[current]!.lineNumber);
        }
        continue;
      }
      if (current >= this.lines.length || this.lines[current]!.indent <= indent) {
        values.push(nil);
        continue;
      }
      const nested = this.parseBlock(current, this.lines[current]!.indent);
      values.push(nested.value);
      current = nested.nextIndex;
    }
    return new YamlParseResult(new AnyArrayValue(values), current);
  }

  parseMapping(index: int32, indent: int32): YamlParseResult {
    const fields = new Map<string, TemplateValue>();
    let current = index;
    while (current < this.lines.length) {
      const line = this.lines[current]!;
      if (line.indent < indent) break;
      if (line.indent !== indent || line.content === "-" || line.content.startsWith("- ")) {
        throw this.error("YAML mapping entries must use consistent indentation", line.lineNumber);
      }
      const separator = this.mappingSeparator(line.content);
      if (separator < 0) throw this.error("YAML mapping entry requires a ':' separator", line.lineNumber);
      const key = line.content.slice(0, separator).trim();
      if (key === "") throw this.error("YAML mapping key cannot be empty", line.lineNumber);
      if (fields.has(key)) throw this.error(`YAML mapping key '${key}' is declared more than once`, line.lineNumber);
      const valueText = substringFrom(line.content, separator + 1).trim();
      current++;
      if (valueText !== "") {
        fields.set(key, this.parseScalar(valueText, line.lineNumber));
        if (current < this.lines.length && this.lines[current]!.indent > indent) {
          throw this.error("A scalar YAML mapping value cannot own an indented block", this.lines[current]!.lineNumber);
        }
        continue;
      }
      if (current >= this.lines.length || this.lines[current]!.indent <= indent) {
        fields.set(key, nil);
        continue;
      }
      const nested = this.parseBlock(current, this.lines[current]!.indent);
      fields.set(key, nested.value);
      current = nested.nextIndex;
    }
    return new YamlParseResult(new DictValue(fields), current);
  }

  mappingSeparator(value: string): int32 {
    let quote = "";
    let escaped = false;
    for (let index: int32 = 0; index < value.length; index++) {
      const character = value[index]!;
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
      if (quote === "" && character === ":" &&
          (index + 1 === value.length || value[index + 1] === " " || value[index + 1] === "\t")) return index;
    }
    return -1;
  }

  parseScalar(value: string, line: int32): TemplateValue {
    const normalized = value.trim().toLowerCase();
    if (normalized === "null" || normalized === "~") return nil;
    if (value.startsWith("[") || value.startsWith("{") || value.startsWith("|") || value.startsWith(">")) {
      throw this.error("YAML flow collections and block scalars are not supported by the current template data contract", line);
    }
    const sourcePath = this.sourcePath;
    const parsed = parseStructuredScalar(value, "yaml", (message: string) =>
      createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_YAML_INVALID", message, sourcePath, line, 1));
    if (parsed.kind === ParamKind.Bool) return new BoolValue(parsed.boolValue);
    if (parsed.kind === ParamKind.Number) return new NumberValue(parsed.numberValue);
    return new StringValue(parsed.stringValue);
  }

  error(message: string, line: int32): TsumoError {
    return createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_YAML_INVALID", message, this.sourcePath, line, 1);
  }
}

const inputFromValue = (value: TemplateValue): StructuredInput => {
  if (value instanceof ResourceValue) {
    const resource = value.value;
    const sourcePath = resource.sourcePath;
    const formatHint = sourcePath === undefined ? undefined : extname(sourcePath).toLowerCase();
    return new StructuredInput(resource.text ?? resource.bytes.toString("utf8"), sourcePath, formatHint);
  }
  if (value instanceof StringValue) return new StructuredInput(value.value);
  if (value instanceof HtmlValue) return new StructuredInput(value.value.value);
  throw createTsumoError(
    "TSUMO_TEMPLATE_UNMARSHAL_INPUT_INVALID",
    "transform.Unmarshal requires a string or resource input",
  );
};

const optionValue = (options: DictValue, name: string): string | undefined => {
  const exact = options.value.get(name);
  if (exact !== undefined) return toPlainString(exact);
  const normalized = name.toLowerCase();
  for (const key of options.value.keys()) {
    if (key.toLowerCase() === normalized) {
      const value = options.value.get(key);
      return value === undefined ? undefined : toPlainString(value);
    }
  }
  return undefined;
};

const normalizeFormat = (requested: string | undefined, input: StructuredInput): string => {
  let explicit: string | undefined = undefined;
  if (requested !== undefined) {
    const selected = requested as string;
    explicit = selected.trim().toLowerCase();
  }
  if (explicit !== undefined && explicit !== "") return explicit === "yml" ? "yaml" : explicit;
  const hint = input.formatHint;
  if (hint === ".json") return "json";
  if (hint === ".yaml" || hint === ".yml") return "yaml";
  const trimmed = input.text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "yaml";
};

export const unmarshalTemplateData = (args: TemplateValue[]): TemplateValue => {
  if (args.length === 0) {
    throw createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_INPUT_MISSING", "transform.Unmarshal requires an input");
  }
  let requestedFormat: string | undefined = undefined;
  if (args.length >= 2) {
    const options = args[0]!;
    if (!(options instanceof DictValue)) {
      throw createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_OPTIONS_INVALID", "transform.Unmarshal options must be a dictionary");
    }
    requestedFormat = optionValue(options as DictValue, "format");
  }
  const input = inputFromValue(args[args.length - 1]!);
  const format = normalizeFormat(requestedFormat, input);
  if (format === "json") return jsonToTemplateValue(parseJson(input.text, input.sourcePath));
  if (format === "yaml") return new YamlTemplateParser(input.text, input.sourcePath).parse();
  throw createTsumoError(
    "TSUMO_TEMPLATE_UNMARSHAL_FORMAT_UNSUPPORTED",
    `transform.Unmarshal format '${format}' is not supported by the current template data contract`,
    input.sourcePath,
  );
};
