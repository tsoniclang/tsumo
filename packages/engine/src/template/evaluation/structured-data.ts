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
import { parseInt32 } from "../../utils/int32.js";
import { substringFrom } from "../../utils/strings.js";
import { readResourceText } from "../../resources/text.js";
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
import { parseTomlTemplateData } from "./toml-data.js";

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

class YamlLogicalLine {
  content: string;
  nextSourceIndex: int32;

  constructor(content: string, nextSourceIndex: int32) {
    this.content = content;
    this.nextSourceIndex = nextSourceIndex;
  }
}

class YamlQuoteScan {
  closed: boolean;
  escapedLineBreak: boolean;

  constructor(closed: boolean, escapedLineBreak: boolean) {
    this.closed = closed;
    this.escapedLineBreak = escapedLineBreak;
  }
}

const yamlError = (message: string, sourcePath: string | undefined, line: int32): TsumoError =>
  createTsumoError("TSUMO_TEMPLATE_UNMARSHAL_YAML_INVALID", message, sourcePath, line, 1);

const yamlSourceIndentation = (raw: string, sourcePath: string | undefined, line: int32): int32 => {
  let indentation: int32 = 0;
  while (indentation < raw.length && raw[indentation] === " ") indentation++;
  if (indentation < raw.length && raw[indentation] === "\t") {
    throw yamlError("YAML indentation cannot contain tabs", sourcePath, line);
  }
  return indentation;
};

const yamlMappingSeparator = (value: string): int32 => {
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
};

const yamlQuotedScalarStart = (content: string): int32 | undefined => {
  let start: int32 = 0;
  if (content.startsWith("- ")) start = 2;
  while (start < content.length && (content[start] === " " || content[start] === "\t")) start++;
  const candidate = substringFrom(content, start);
  const separator = yamlMappingSeparator(candidate);
  if (separator >= 0) {
    start += separator + 1;
    while (start < content.length && (content[start] === " " || content[start] === "\t")) start++;
  }
  if (start >= content.length || (content[start] !== "\"" && content[start] !== "'")) return undefined;
  return start;
};

const scanYamlQuotedScalar = (content: string, quoteStart: int32, quote: string): YamlQuoteScan => {
  for (let index: int32 = quoteStart + 1; index < content.length; index++) {
    const character = content[index]!;
    if (quote === "\"" && character === "\\") {
      if (index + 1 >= content.length) return new YamlQuoteScan(false, true);
      index++;
      continue;
    }
    if (character !== quote) continue;
    if (quote === "'" && index + 1 < content.length && content[index + 1] === "'") {
      index++;
      continue;
    }
    return new YamlQuoteScan(true, false);
  }
  return new YamlQuoteScan(false, false);
};

const readYamlLogicalLine = (
  sourceLines: string[],
  sourceIndex: int32,
  indent: int32,
  sourcePath: string | undefined,
): YamlLogicalLine => {
  const raw = sourceLines[sourceIndex]!;
  let content = stripStructuredComment(substringFrom(raw, indent), "yaml").trimEnd();
  const quoteStart = yamlQuotedScalarStart(content);
  if (quoteStart === undefined) return new YamlLogicalLine(content, sourceIndex + 1);
  const quote = content[quoteStart]!;
  let scan = scanYamlQuotedScalar(content, quoteStart, quote);
  if (scan.closed) return new YamlLogicalLine(content, sourceIndex + 1);

  const minimumContinuationIndent: int32 = indent;
  let nextSourceIndex: int32 = sourceIndex + 1;
  let blankLineCount: int32 = 0;
  while (!scan.closed) {
    if (scan.escapedLineBreak) content = content.slice(0, content.length - 1);
    if (nextSourceIndex >= sourceLines.length) {
      throw yamlError("String has mismatched quotes", sourcePath, sourceIndex + 1);
    }
    const continuationRaw = sourceLines[nextSourceIndex]!;
    const continuationIndent = yamlSourceIndentation(continuationRaw, sourcePath, nextSourceIndex + 1);
    const continuation = continuationRaw.trim();
    nextSourceIndex++;
    if (continuation === "") {
      blankLineCount++;
      continue;
    }
    if (continuationIndent < minimumContinuationIndent) {
      throw yamlError("Multiline YAML scalar indentation is inconsistent", sourcePath, nextSourceIndex);
    }
    if (!scan.escapedLineBreak) {
      content += blankLineCount === 0 ? " " : "\n".repeat(blankLineCount);
    } else if (blankLineCount > 0) {
      content += "\n".repeat(blankLineCount);
    }
    content += continuation;
    blankLineCount = 0;
    scan = scanYamlQuotedScalar(content, quoteStart, quote);
  }
  return new YamlLogicalLine(stripStructuredComment(content, "yaml").trimEnd(), nextSourceIndex);
};

class YamlParseResult {
  value: TemplateValue;
  nextIndex: int32;

  constructor(value: TemplateValue, nextIndex: int32) {
    this.value = value;
    this.nextIndex = nextIndex;
  }
}

class YamlBlockScalarHeader {
  folded: boolean;
  chomping: "clip" | "strip" | "keep";
  indentation: int32 | undefined;

  constructor(
    folded: boolean,
    chomping: "clip" | "strip" | "keep",
    indentation: int32 | undefined,
  ) {
    this.folded = folded;
    this.chomping = chomping;
    this.indentation = indentation;
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
  sourceLines: string[];
  sourcePath: string | undefined;

  constructor(text: string, sourcePath?: string) {
    this.lines = [];
    this.sourcePath = sourcePath;
    const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    const sourceLines = normalized.split("\n");
    this.sourceLines = sourceLines;
    let index: int32 = 0;
    while (index < sourceLines.length) {
      const raw = sourceLines[index]!;
      const indent = yamlSourceIndentation(raw, sourcePath, index + 1);
      const logical = readYamlLogicalLine(sourceLines, index, indent, sourcePath);
      const content = logical.content;
      const lineNumber: int32 = index + 1;
      index = logical.nextSourceIndex;
      if (content.trim() === "" || content.trim() === "---" || content.trim() === "...") continue;
      this.lines.push(new YamlLine(indent, content, lineNumber));
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
    if (line.content === "-" || line.content.startsWith("- ")) {
      return this.parseSequence(index, indent);
    }
    if (yamlMappingSeparator(line.content) >= 0) return this.parseMapping(index, indent);
    return new YamlParseResult(this.parseScalar(line.content, line.lineNumber), index + 1);
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
        const separator = yamlMappingSeparator(item);
        if (separator >= 0) {
          const key = item.slice(0, separator).trim();
          if (key === "") throw this.error("YAML mapping key cannot be empty", line.lineNumber);
          const valueText = substringFrom(item, separator + 1).trim();
          if (valueText === "") {
            throw this.error(
              "A YAML sequence mapping must begin with a scalar-valued field",
              line.lineNumber,
            );
          }
          const fields = new Map<string, TemplateValue>();
          const blockHeader = this.parseBlockScalarHeader(valueText, line.lineNumber);
          if (blockHeader !== undefined) {
            const block = this.parseBlockScalar(blockHeader, indent, line.lineNumber, current);
            fields.set(key, block.value);
            current = block.nextIndex;
          } else {
            fields.set(key, this.parseScalar(valueText, line.lineNumber));
          }
          if (current < this.lines.length && this.lines[current]!.indent > indent) {
            const continuation = this.parseBlock(current, this.lines[current]!.indent);
            if (!(continuation.value instanceof DictValue)) {
              throw this.error("A YAML sequence mapping continuation must be a mapping", this.lines[current]!.lineNumber);
            }
            const continuationFields = (continuation.value as DictValue).value;
            for (const continuationKey of continuationFields.keys()) {
              if (fields.has(continuationKey)) {
                throw this.error(`YAML mapping key '${continuationKey}' is declared more than once`, this.lines[current]!.lineNumber);
              }
              const continuationValue = continuationFields.get(continuationKey);
              if (continuationValue === undefined) {
                throw this.error(`YAML mapping key '${continuationKey}' disappeared`, this.lines[current]!.lineNumber);
              }
              fields.set(continuationKey, continuationValue);
            }
            current = continuation.nextIndex;
          }
          values.push(new DictValue(fields));
          continue;
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
      const separator = yamlMappingSeparator(line.content);
      if (separator < 0) throw this.error("YAML mapping entry requires a ':' separator", line.lineNumber);
      const key = line.content.slice(0, separator).trim();
      if (key === "") throw this.error("YAML mapping key cannot be empty", line.lineNumber);
      if (fields.has(key)) throw this.error(`YAML mapping key '${key}' is declared more than once`, line.lineNumber);
      const valueText = substringFrom(line.content, separator + 1).trim();
      current++;
      if (valueText !== "") {
        const blockHeader = this.parseBlockScalarHeader(valueText, line.lineNumber);
        if (blockHeader !== undefined) {
          const block = this.parseBlockScalar(blockHeader, indent, line.lineNumber, current);
          fields.set(key, block.value);
          current = block.nextIndex;
          continue;
        }
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

  parseBlockScalarHeader(value: string, line: int32): YamlBlockScalarHeader | undefined {
    if (!value.startsWith("|") && !value.startsWith(">")) return undefined;
    let chomping: "clip" | "strip" | "keep" = "clip";
    let indentation: int32 | undefined = undefined;
    for (let index: int32 = 1; index < value.length; index++) {
      const character = value[index]!;
      if (character === "-" || character === "+") {
        if (chomping !== "clip") throw this.error("YAML block scalar has more than one chomping indicator", line);
        chomping = character === "-" ? "strip" : "keep";
        continue;
      }
      const parsedIndentation = parseInt32(character);
      if (parsedIndentation === undefined || parsedIndentation < 1 || parsedIndentation > 9) {
        throw this.error(`YAML block scalar indicator '${value}' is invalid`, line);
      }
      if (indentation !== undefined) throw this.error("YAML block scalar has more than one indentation indicator", line);
      indentation = parsedIndentation;
    }
    return new YamlBlockScalarHeader(value.startsWith(">"), chomping, indentation);
  }

  parseBlockScalar(
    header: YamlBlockScalarHeader,
    parentIndent: int32,
    headerLine: int32,
    nextParsedIndex: int32,
  ): YamlParseResult {
    const sourceStart: int32 = headerLine;
    let sourceEnd: int32 = sourceStart;
    while (sourceEnd < this.sourceLines.length) {
      const raw = this.sourceLines[sourceEnd]!;
      if (raw.trim() === "") {
        sourceEnd++;
        continue;
      }
      const indentation = yamlSourceIndentation(raw, this.sourcePath, sourceEnd + 1);
      if (indentation <= parentIndent) break;
      sourceEnd++;
    }

    let parsedIndex = nextParsedIndex;
    while (parsedIndex < this.lines.length && this.lines[parsedIndex]!.lineNumber <= sourceEnd) {
      parsedIndex++;
    }

    let contentIndent: int32 | undefined = undefined;
    const explicitIndentation = header.indentation;
    if (explicitIndentation !== undefined) contentIndent = parentIndent + explicitIndentation;
    if (contentIndent === undefined) {
      for (let sourceIndex: int32 = sourceStart; sourceIndex < sourceEnd; sourceIndex++) {
        const raw = this.sourceLines[sourceIndex]!;
        if (raw.trim() === "") continue;
        contentIndent = yamlSourceIndentation(raw, this.sourcePath, sourceIndex + 1);
        break;
      }
    }
    const selectedIndent: int32 = contentIndent !== undefined ? contentIndent : parentIndent + 1;
    const values: string[] = [];
    const indentations: int32[] = [];
    for (let sourceIndex: int32 = sourceStart; sourceIndex < sourceEnd; sourceIndex++) {
      const raw = this.sourceLines[sourceIndex]!;
      if (raw.trim() === "") {
        values.push("");
        indentations.push(selectedIndent);
        continue;
      }
      const indentation = yamlSourceIndentation(raw, this.sourcePath, sourceIndex + 1);
      if (indentation < selectedIndent) {
        throw this.error("YAML block scalar indentation is inconsistent", sourceIndex + 1);
      }
      values.push(substringFrom(raw, selectedIndent));
      indentations.push(indentation);
    }

    let lastContentIndex: int32 = values.length - 1;
    while (lastContentIndex >= 0 && values[lastContentIndex] === "") lastContentIndex--;
    let rendered = "";
    for (let index: int32 = 0; index <= lastContentIndex; index++) {
      rendered += values[index]!;
      if (index >= lastContentIndex) continue;
      if (
        !header.folded ||
        values[index] === "" ||
        values[index + 1] === "" ||
        indentations[index]! > selectedIndent ||
        indentations[index + 1]! > selectedIndent
      ) {
        rendered += "\n";
      } else {
        rendered += " ";
      }
    }
    if (header.chomping === "clip") rendered += "\n";
    if (header.chomping === "keep") {
      const trailingLineCount: int32 = values.length - lastContentIndex;
      rendered += "\n".repeat(trailingLineCount);
    }
    return new YamlParseResult(new StringValue(rendered), parsedIndex);
  }

  parseScalar(value: string, line: int32): TemplateValue {
    const normalized = value.trim().toLowerCase();
    if (normalized === "null" || normalized === "~") return nil;
    if (value.startsWith("[") || value.startsWith("{")) {
      throw this.error("YAML flow collections are not supported by the current template data contract", line);
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
    return new StructuredInput(readResourceText(resource, "transform.Unmarshal"), sourcePath, formatHint);
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
  if (hint === ".toml") return "toml";
  const trimmed = input.text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "yaml";
};

export const parseTemplateDataText = (
  text: string,
  formatRaw: string,
  sourcePath?: string,
): TemplateValue => {
  const format = formatRaw.trim().toLowerCase();
  if (format === "json") return jsonToTemplateValue(parseJson(text, sourcePath));
  if (format === "yaml" || format === "yml") return new YamlTemplateParser(text, sourcePath).parse();
  if (format === "toml") return parseTomlTemplateData(text, sourcePath);
  throw createTsumoError(
    "TSUMO_TEMPLATE_UNMARSHAL_FORMAT_UNSUPPORTED",
    `transform.Unmarshal format '${format}' is not supported by the current template data contract`,
    sourcePath,
  );
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
  return parseTemplateDataText(input.text, format, input.sourcePath);
};
