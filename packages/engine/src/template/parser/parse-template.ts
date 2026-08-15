import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { substringFrom } from "../../utils/strings.js";
import {
  AssignmentNode,
  BlockNode,
  BreakNode,
  ContinueNode,
  IfNode,
  OutputNode,
  RangeNode,
  TemplateInvokeNode,
  TemplateNode,
  TemplateVariableBinding,
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
  terminatorSegment: TemplateSegment | undefined;
  terminatorSegmentIndex: int32;

  constructor(
    nodes: TemplateNode[],
    terminator: TemplateTerminator,
    elseTokens: string[],
    terminatorSegment: TemplateSegment | undefined,
    terminatorSegmentIndex: int32,
  ) {
    this.nodes = nodes;
    this.terminator = terminator;
    this.elseTokens = elseTokens;
    this.terminatorSegment = terminatorSegment;
    this.terminatorSegmentIndex = terminatorSegmentIndex;
  }
}

class ParsedControlPipeline {
  pipeline: Pipeline;
  binding: TemplateVariableBinding | undefined;

  constructor(pipeline: Pipeline, binding: TemplateVariableBinding | undefined) {
    this.pipeline = pipeline;
    this.binding = binding;
  }
}

const parseControlPipeline = (
  tokens: string[],
  sourcePath: string | undefined,
  line: int32,
  column: int32,
): ParsedControlPipeline => {
  const first = tokens.length > 0 ? tokens[0]! : "";
  const operation = tokens.length > 1 ? tokens[1]! : "";
  const hasBinding = first.startsWith("$") && first !== "$" && !first.startsWith("$.") &&
    first.indexOf(".") < 0 && (operation === ":=" || operation === "=");
  if (!hasBinding) {
    return new ParsedControlPipeline(parsePipeline(tokens, sourcePath, line, column), undefined);
  }
  if (tokens.length < 3) {
    throw createTsumoError(
      "TSUMO_TEMPLATE_CONTROL_PIPELINE_MISSING",
      "Template control variable binding requires a value pipeline",
      sourcePath,
      line,
      column,
    );
  }
  return new ParsedControlPipeline(
    parsePipeline(sliceTokens(tokens, 2), sourcePath, line, column),
    new TemplateVariableBinding(substringFrom(first, 1), operation === ":="),
  );
};

class TemplateParser {
  segments: TemplateSegment[];
  index: int32;
  defines: Map<string, TemplateNode[]>;
  sourcePath: string | undefined;
  sourceText: string;
  rangeDepth: int32;

  constructor(segments: TemplateSegment[], sourceText: string, sourcePath?: string) {
    this.segments = segments;
    this.index = 0;
    this.defines = new Map<string, TemplateNode[]>();
    this.sourcePath = sourcePath;
    this.sourceText = sourceText;
    this.rangeDepth = 0;
  }

  parseRoot(): Template {
    const result = this.parseNodes(false, false, undefined);
    return new Template(result.nodes, this.defines, this.sourcePath);
  }

  parseIndependentNodes(opening: TemplateSegment): ParseNodesResult {
    const previousRangeDepth = this.rangeDepth;
    this.rangeDepth = 0;
    const result = this.parseNodes(false, true, opening);
    this.rangeDepth = previousRangeDepth;
    return result;
  }

  parseIf(control: ParsedControlPipeline, opening: TemplateSegment): IfNode {
    const thenResult = this.parseNodes(true, true, opening);
    if (thenResult.terminator === "end") {
      return new IfNode(control.pipeline, control.binding, thenResult.nodes, []);
    }
    if (thenResult.terminator !== "else") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_BLOCK_UNCLOSED",
        "Template if block has no closing '{{ end }}'",
        this.sourcePath,
        opening.line,
        opening.column,
      );
    }

    return new IfNode(
      control.pipeline,
      control.binding,
      thenResult.nodes,
      this.parseAlternative(thenResult, opening),
    );
  }

  parseWith(control: ParsedControlPipeline, opening: TemplateSegment, sourceSegmentIndex: int32): WithNode {
    const body = this.parseNodes(true, true, opening);
    const elseNodes = body.terminator === "else" ? this.parseAlternative(body, opening) : [];
    return new WithNode(control.pipeline, control.binding, body.nodes, elseNodes, this.sourceText, sourceSegmentIndex);
  }

  parseAlternative(result: ParseNodesResult, opening: TemplateSegment): TemplateNode[] {
    const tokens = result.elseTokens;
    if (tokens.length === 1) return this.parseNodes(false, true, opening).nodes;
    const elseSegment = result.terminatorSegment ?? opening;
    if (tokens.length >= 2 && tokens[1] === "if") {
      const control = parseControlPipeline(sliceTokens(tokens, 2), this.sourcePath, elseSegment.line, elseSegment.column);
      return [this.parseIf(control, elseSegment)];
    }
    if (tokens.length >= 2 && tokens[1] === "with") {
      const control = parseControlPipeline(sliceTokens(tokens, 2), this.sourcePath, elseSegment.line, elseSegment.column);
      return [this.parseWith(control, elseSegment, result.terminatorSegmentIndex)];
    }
    throw createTsumoError(
      "TSUMO_TEMPLATE_ELSE_ACTION_INVALID",
      "Template else action supports only 'if' or 'with' continuations",
      this.sourcePath,
      elseSegment.line,
      elseSegment.column,
    );
  }

  parseNodes(
    allowElse: boolean,
    requireEnd: boolean,
    opening: TemplateSegment | undefined,
  ): ParseNodesResult {
    const nodes: TemplateNode[] = [];
    while (this.index < this.segments.length) {
      const sourceSegmentIndex = this.index;
      const segment = this.segments[this.index]!;
      this.index++;
      if (!segment.isAction) {
        nodes.push(new TextNode(segment.text));
        continue;
      }
      if (segment.text.startsWith("/*") && segment.text.endsWith("*/")) continue;

      const tokens = tokenizeTemplateAction(segment.text, segment.line, segment.column, this.sourcePath);
      if (tokens.length === 0) continue;
      const head = tokens[0]!;
      if (head === "end") {
        if (!requireEnd) {
          throw createTsumoError(
            "TSUMO_TEMPLATE_END_UNEXPECTED",
            "Template contains '{{ end }}' without an open block",
            this.sourcePath,
            segment.line,
            segment.column,
          );
        }
        return new ParseNodesResult(nodes, "end", [], segment, sourceSegmentIndex);
      }
      if (head === "else") {
        if (!allowElse) {
          throw createTsumoError(
            "TSUMO_TEMPLATE_ELSE_UNEXPECTED",
            "Template contains '{{ else }}' outside an if, with, or range block",
            this.sourcePath,
            segment.line,
            segment.column,
          );
        }
        return new ParseNodesResult(nodes, "else", tokens, segment, sourceSegmentIndex);
      }

      if (head === "break" || head === "continue") {
        if (tokens.length !== 1) {
          throw createTsumoError(
            "TSUMO_TEMPLATE_LOOP_CONTROL_INVALID",
            `Template ${head} action cannot have arguments`,
            this.sourcePath,
            segment.line,
            segment.column,
          );
        }
        if (this.rangeDepth === 0) {
          throw createTsumoError(
            head === "break" ? "TSUMO_TEMPLATE_BREAK_OUTSIDE_RANGE" : "TSUMO_TEMPLATE_CONTINUE_OUTSIDE_RANGE",
            `Template ${head} action is only valid inside a range body`,
            this.sourcePath,
            segment.line,
            segment.column,
          );
        }
        nodes.push(head === "break" ? new BreakNode() : new ContinueNode());
        continue;
      }

      if (head === "define") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_DEFINE_NAME_MISSING", "Template define action requires a name", this.sourcePath, segment.line, segment.column);
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        if (this.defines.has(name)) {
          throw createTsumoError("TSUMO_TEMPLATE_DEFINE_DUPLICATE", `Template definition '${name}' is declared more than once`, this.sourcePath, segment.line, segment.column);
        }
        const body = this.parseIndependentNodes(segment);
        this.defines.set(name, body.nodes);
        continue;
      }

      if (head === "block") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_BLOCK_NAME_MISSING", "Template block action requires a name", this.sourcePath, segment.line, segment.column);
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const contextTokens = tokens.length >= 3 ? sliceTokens(tokens, 2) : ["."];
        const body = this.parseIndependentNodes(segment);
        nodes.push(new BlockNode(name, parsePipeline(contextTokens, this.sourcePath, segment.line, segment.column), body.nodes));
        continue;
      }

      if (head === "if") {
        const control = parseControlPipeline(sliceTokens(tokens, 1), this.sourcePath, segment.line, segment.column);
        nodes.push(this.parseIf(control, segment));
        continue;
      }

      if (head === "with") {
        const control = parseControlPipeline(sliceTokens(tokens, 1), this.sourcePath, segment.line, segment.column);
        nodes.push(this.parseWith(
          control,
          segment,
          sourceSegmentIndex,
        ));
        continue;
      }

      if (head === "range") {
        let tokenIndex: int32 = 1;
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

        this.rangeDepth++;
        const body = this.parseNodes(true, true, segment);
        this.rangeDepth--;
        const elseNodes = body.terminator === "else" ? this.parseAlternative(body, segment) : [];
        nodes.push(new RangeNode(parsePipeline(expressionTokens, this.sourcePath, segment.line, segment.column), keyVariable, valueVariable, body.nodes, elseNodes));
        continue;
      }

      if (head === "template") {
        if (tokens.length < 2) {
          throw createTsumoError("TSUMO_TEMPLATE_INVOKE_NAME_MISSING", "Template action requires a definition name", this.sourcePath, segment.line, segment.column);
        }
        const name = parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const contextTokens = tokens.length >= 3 ? sliceTokens(tokens, 2) : ["."];
        nodes.push(new TemplateInvokeNode(name, parsePipeline(contextTokens, this.sourcePath, segment.line, segment.column)));
        continue;
      }

      if (tokens.length >= 3 && head.startsWith("$") && head !== "$" && !head.startsWith("$.")) {
        const operation = tokens[1]!;
        if (operation === ":=" || operation === "=") {
          nodes.push(new AssignmentNode(
            substringFrom(head, 1),
            parsePipeline(sliceTokens(tokens, 2), this.sourcePath, segment.line, segment.column),
            operation === ":=",
          ));
          continue;
        }
      }

      nodes.push(new OutputNode(parsePipeline(tokens, this.sourcePath, segment.line, segment.column), true));
    }

    if (requireEnd) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_BLOCK_UNCLOSED",
        "Template block has no closing '{{ end }}'",
        this.sourcePath,
        opening?.line,
        opening?.column,
      );
    }
    return new ParseNodesResult(nodes, "eof", [], undefined, -1);
  }
}

export const parseTemplate = (template: string, sourcePath?: string): Template => {
  return new TemplateParser(scanTemplateSegments(template, sourcePath), template, sourcePath).parseRoot();
};
