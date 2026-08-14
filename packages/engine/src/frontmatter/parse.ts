import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { replaceLineEndings, substringCount, substringFrom } from "../utils/strings.js";
import { FrontMatter } from "./data.js";
import { parseJsonFrontMatter } from "./json.js";
import { ParsedContent } from "./parsed-content.js";
import { parseTomlFrontMatter } from "./toml.js";
import { parseYamlFrontMatter } from "./yaml.js";

const tryParseJsonFrontMatter = (text: string, sourcePath?: string): ParsedContent | undefined => {
  const start: int32 = 0;
  if (text.length === 0 || text[start] !== "{") return undefined;

  let depth: int32 = 0;
  let inString = false;
  let escaped = false;
  let end: int32 = -1;
  for (let index: int32 = start; index < text.length; index++) {
    const current = text[index]!;
    if (inString && escaped) {
      escaped = false;
      continue;
    }
    if (inString && current === "\\") {
      escaped = true;
      continue;
    }
    if (current === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (current === "{") depth++;
    else if (current === "}") {
      depth--;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw createTsumoError(
      "TSUMO_FRONTMATTER_JSON_UNCLOSED",
      "JSON front matter has no closing object delimiter",
      sourcePath,
      1,
      1,
    );
  }
  const input = substringCount(text, start, end - start);
  const body = substringFrom(text, end).trimStart();
  return new ParsedContent(parseJsonFrontMatter(input, sourcePath), body);
};

const parseDelimitedFrontMatter = (
  lines: string[],
  delimiter: string,
  format: string,
  sourcePath: string | undefined,
): ParsedContent => {
  const frontMatterLines: string[] = [];
  let bodyStart: int32 = lines.length;
  for (let index: int32 = 1; index < lines.length; index++) {
    if (lines[index]!.trim() === delimiter) {
      bodyStart = index + 1;
      const body = lines.slice(bodyStart).join("\n").trimStart();
      const frontMatter = format === "yaml"
        ? parseYamlFrontMatter(frontMatterLines, sourcePath)
        : parseTomlFrontMatter(frontMatterLines, sourcePath);
      return new ParsedContent(frontMatter, body);
    }
    frontMatterLines.push(lines[index]!);
  }
  throw createTsumoError(
    "TSUMO_FRONTMATTER_DELIMITER_UNCLOSED",
    `${format === "yaml" ? "YAML" : "TOML"} front matter is missing its closing ${delimiter} delimiter`,
    sourcePath,
    1,
    1,
  );
};

export const parseContent = (text: string, sourcePath?: string): ParsedContent => {
  const json = tryParseJsonFrontMatter(text, sourcePath);
  if (json !== undefined) return json;

  const normalized = replaceLineEndings(text, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) return new ParsedContent(new FrontMatter(), "");
  const firstLine = lines[0]!.trim();
  if (firstLine === "---") return parseDelimitedFrontMatter(lines, "---", "yaml", sourcePath);
  if (firstLine === "+++") return parseDelimitedFrontMatter(lines, "+++", "toml", sourcePath);
  return new ParsedContent(new FrontMatter(), text);
};
