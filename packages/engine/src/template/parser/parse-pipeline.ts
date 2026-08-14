import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { substringFrom } from "../../utils/strings.js";
import { AccessExpr, Command, Expr, Pipeline, PipelineExpr, TokenExpr } from "../syntax/expressions.js";

class PipelineParser {
  tokens: string[];
  index: int32;
  sourcePath: string | undefined;
  line: int32 | undefined;
  column: int32 | undefined;

  constructor(tokens: string[], sourcePath?: string, line?: int32, column?: int32) {
    this.tokens = tokens;
    this.index = 0;
    this.sourcePath = sourcePath;
    this.line = line;
    this.column = column;
  }

  error(code: string, message: string): ReturnType<typeof createTsumoError> {
    return createTsumoError(code, message, this.sourcePath, this.line, this.column);
  }

  parse(stopOnRightParen: boolean): Pipeline {
    const stages: Command[] = [];
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index]!;
      if (stopOnRightParen && token === ")") break;
      if (token === "|") {
        throw this.error("TSUMO_TEMPLATE_PIPELINE_EMPTY_STAGE", "Template pipeline contains an empty stage");
      }
      stages.push(this.parseCommand());
      if (this.index < this.tokens.length && this.tokens[this.index] === "|") {
        this.index++;
        if (this.index >= this.tokens.length) {
          throw this.error("TSUMO_TEMPLATE_PIPELINE_EMPTY_STAGE", "Template pipeline ends with an empty stage");
        }
      }
    }
    return new Pipeline(stages);
  }

  parseCommand(): Command {
    const head = this.parseExpression();
    const args: Expr[] = [];
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index]!;
      if (token === "|" || token === ")") break;
      args.push(this.parseExpression());
    }
    return new Command(head, args);
  }

  parseExpression(): Expr {
    if (this.index >= this.tokens.length) {
      throw this.error("TSUMO_TEMPLATE_EXPRESSION_MISSING", "Template command is missing an expression");
    }
    const token = this.tokens[this.index]!;
    if (token === ")") {
      throw this.error("TSUMO_TEMPLATE_PAREN_UNEXPECTED", "Template expression contains an unexpected ')'");
    }

    if (token === "(") {
      this.index++;
      const inner = this.parse(true);
      if (this.index >= this.tokens.length || this.tokens[this.index] !== ")") {
        throw this.error("TSUMO_TEMPLATE_PAREN_UNCLOSED", "Template expression opened with '(' but has no closing ')'");
      }
      this.index++;
      let expression: Expr = new PipelineExpr(inner);
      while (this.index < this.tokens.length) {
        const next = this.tokens[this.index]!;
        if (!next.startsWith(".") || next === ".") break;
        expression = new AccessExpr(expression, substringFrom(next, 1).split("."));
        this.index++;
      }
      return expression;
    }

    this.index++;
    return new TokenExpr(token);
  }
}

export const parsePipeline = (
  tokens: string[],
  sourcePath?: string,
  line?: int32,
  column?: int32,
): Pipeline => {
  if (tokens.length === 0) return new Pipeline([]);
  const parser = new PipelineParser(tokens, sourcePath, line, column);
  const pipeline = parser.parse(false);
  if (parser.index !== tokens.length) {
    throw createTsumoError(
      "TSUMO_TEMPLATE_TOKEN_UNEXPECTED",
      `Unexpected template token: ${tokens[parser.index]!}`,
      sourcePath,
      line,
      column,
    );
  }
  return pipeline;
};
