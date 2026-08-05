import type { int } from "@tsonic/csharp/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { substringFrom } from "../../utils/strings.js";
import {
  AssignmentNode,
  BlockNode,
  IfNode,
  OutputNode,
  RangeNode,
  TemplateInvokeNode,
  TemplateNode,
  TextNode,
  WithNode,
} from "../nodes.js";
import { Template } from "../template.js";
import type { Pipeline } from "../syntax/expressions.js";
import { parsePipeline } from "./parse-pipeline.js";
import { parseStringLiteral, scanTemplateSegments, sliceTokens, TemplateSegment, tokenizeTemplateAction } from "./tokens.js";

type TemplateTerminator = "end" | "else" | "eof";

class ParseNodesResult {
  nodes: TemplateNode[];
  terminator: TemplateTerminator;
  elseTokens: string[];

  constructor(nodes: TemplateNode[], terminator: TemplateTerminator, elseTokens?: string[]) {
    this.nodes = nodes;
    this.terminator = terminator;
    this.elseTokens = elseTokens ?? [];
  }
}

class TemplateParser {
  segments: TemplateSegment[];
  index: int;
  defines: Map<string, TemplateNode[]>;

  constructor(segments: TemplateSegment[]) {
    this.segments = segments;
    this.index = 0;
    this.defines = new Map<string, TemplateNode[]>();
  }

  parseRoot(): Template {
    const result = this.parseNodes(false, false);
    return new Template(result.nodes, this.defines);
  }

  parseIf(condition: Pipeline, opening: TemplateSegment): IfNode {
    const thenResult = this.parseNodes(true, true);
    if (thenResult.terminator === "end") return new IfNode(condition, thenResult.nodes, []);
    if (thenResult.terminator !== "else") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_BLOCK_UNCLOSED",
        "Template if block has no closing '{{ end }}'",
        undefined,
        opening.line,
        opening.column,
      );
    }

    const elseTokens = thenResult.elseTokens;
    if (elseTokens.length >= 2 && elseTokens[1] === "if") {
      const nestedCondition = parsePipeline(sliceTokens(elseTokens, 2));
      return new IfNode(condition, thenResult.nodes, [this.parseIf(nestedCondition, opening)]);
    }

    const elseResult = this.parseNodes(false, true);
    return new IfNode(condition, thenResult.nodes, elseResult.nodes);
  }

  parseNodes(allowElse: boolean, requireEnd: boolean): ParseNodesResult {
    const nodes: TemplateNode[] = [];
    while (this.index < this.segments.length) {
      const segment = this.segments[this.index]!;
      this.index++;
      if (!segment.isAction) {
        nodes.push(new TextNode(segment.text));
        continue;
      }
      if (segment.text.startsWith("/*") && segment.text.endsWith("*/")) continue;

      const tokens = tokenizeTemplateAction(segment.text, segment.line, segment.column);
      if (tokens.length === 0) continue;
      const head = tokens[0]!;
      if (head === "end") {
        if (!requireEnd) {
          throw createTsumoError(
            "TSUMO_TEMPLATE_END_UNEXPECTED",
            "Template contains '{{ end }}' without an open block",
            undefined,
            segment.line,
            segment.column,
          );
        }
        return new ParseNodesResult(nodes, "end");
      }
      if (head === "else") {
        if (!allowElse) {
          throw createTsumoError(
            "TSUMO_TEMPLATE_ELSE_UNEXPECTED",
            "Template contains '{{ else }}' outside an if, with, or range block",
            undefined,
            segment.line,
            segment.column,
          );
        }
        return new ParseNodesResult(nodes, "else", tokens);
      }

      if (head === "define") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_DEFINE_NAME_MISSING", "Template define action requires a name");
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        if (this.defines.has(name)) {
          throw createTsumoError("TSUMO_TEMPLATE_DEFINE_DUPLICATE", `Template definition '${name}' is declared more than once`);
        }
        const body = this.parseNodes(false, true);
        this.defines.set(name, body.nodes);
        continue;
      }

      if (head === "block") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_BLOCK_NAME_MISSING", "Template block action requires a name");
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const contextTokens = tokens.length >= 3 ? sliceTokens(tokens, 2) : ["."];
        const body = this.parseNodes(false, true);
        nodes.push(new BlockNode(name, parsePipeline(contextTokens), body.nodes));
        continue;
      }

      if (head === "if") {
        nodes.push(this.parseIf(parsePipeline(sliceTokens(tokens, 1)), segment));
        continue;
      }

      if (head === "with") {
        const body = this.parseNodes(true, true);
        let elseNodes: TemplateNode[] = [];
        if (body.terminator === "else") {
          const elseResult = this.parseNodes(false, true);
          elseNodes = elseResult.nodes;
        }
        nodes.push(new WithNode(parsePipeline(sliceTokens(tokens, 1)), body.nodes, elseNodes));
        continue;
      }

      if (head === "range") {
        let tokenIndex: int = 1;
        let keyVariable: string | undefined = undefined;
        let valueVariable: string | undefined = undefined;
        const first = tokenIndex < tokens.length ? tokens[tokenIndex]! : "";
        const isVariable = first.startsWith("$") && first !== "$" && !first.startsWith("$.");
        const hasValueDeclaration = tokenIndex + 1 < tokens.length &&
          (tokens[tokenIndex + 1] === ":=" || tokens[tokenIndex + 1] === "=");
        const hasKeyValueDeclaration = tokenIndex + 3 < tokens.length &&
          tokens[tokenIndex]!.startsWith("$") &&
          tokens[tokenIndex + 1] === "," &&
          tokens[tokenIndex + 2]!.startsWith("$") &&
          (tokens[tokenIndex + 3] === ":=" || tokens[tokenIndex + 3] === "=");

        let expressionTokens: string[];
        if (hasKeyValueDeclaration) {
          keyVariable = substringFrom(tokens[tokenIndex]!, 1);
          valueVariable = substringFrom(tokens[tokenIndex + 2]!, 1);
          tokenIndex += 4;
          expressionTokens = sliceTokens(tokens, tokenIndex);
        } else if (isVariable && hasValueDeclaration) {
          valueVariable = substringFrom(tokens[tokenIndex]!, 1);
          tokenIndex += 2;
          expressionTokens = sliceTokens(tokens, tokenIndex);
        } else {
          expressionTokens = sliceTokens(tokens, 1);
        }

        const body = this.parseNodes(true, true);
        let elseNodes: TemplateNode[] = [];
        if (body.terminator === "else") {
          const elseResult = this.parseNodes(false, true);
          elseNodes = elseResult.nodes;
        }
        nodes.push(new RangeNode(parsePipeline(expressionTokens), keyVariable, valueVariable, body.nodes, elseNodes));
        continue;
      }

      if (head === "template") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_INVOKE_NAME_MISSING", "Template action requires a definition name");
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const contextTokens = tokens.length >= 3 ? sliceTokens(tokens, 2) : ["."];
        nodes.push(new TemplateInvokeNode(name, parsePipeline(contextTokens)));
        continue;
      }

      if (tokens.length >= 3 && head.startsWith("$") && head !== "$" && !head.startsWith("$.")) {
        const operation = tokens[1]!;
        if (operation === ":=" || operation === "=") {
          nodes.push(new AssignmentNode(
            substringFrom(head, 1),
            parsePipeline(sliceTokens(tokens, 2)),
            operation === ":=",
          ));
          continue;
        }
      }

      nodes.push(new OutputNode(parsePipeline(tokens), true));
    }

    if (requireEnd) {
      throw createTsumoError("TSUMO_TEMPLATE_BLOCK_UNCLOSED", "Template block has no closing '{{ end }}'");
    }
    return new ParseNodesResult(nodes, "eof");
  }
}

export const parseTemplate = (template: string): Template => {
  return new TemplateParser(scanTemplateSegments(template)).parseRoot();
};
