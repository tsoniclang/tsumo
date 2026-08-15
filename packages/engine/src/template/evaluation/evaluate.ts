import { createTsumoError } from "../../diagnostics.js";
import type { TemplateEnvironment } from "../environment.js";
import type { TemplateNode } from "../nodes.js";
import type { RenderScope } from "../scope.js";
import { AccessExpr, Command, CommandExpr, Expr, Pipeline, PipelineExpr, TokenExpr } from "../syntax/expressions.js";
import type { TemplateValue } from "../values.js";
import { parseStringLiteral } from "../parser/tokens.js";
import { nil } from "../runtime-helpers.js";
import { callMethod, evalToken } from "./expression-semantics.js";
import { resolvePath } from "./property-semantics.js";
import { isNumberLiteral } from "./scalar-semantics.js";
import { callTemplateFunction } from "../functions/call-function.js";

export class TemplateEvaluationContext {
  scope: RenderScope;
  environment: TemplateEnvironment;
  overrides: Map<string, TemplateNode[]>;
  defines: Map<string, TemplateNode[]>;

  constructor(
    scope: RenderScope,
    environment: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ) {
    this.scope = scope;
    this.environment = environment;
    this.overrides = overrides;
    this.defines = defines;
  }
}

export function evaluatePipeline(
  pipeline: Pipeline,
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
): TemplateValue {
  const context = new TemplateEvaluationContext(scope, environment, overrides, defines);
  if (pipeline.stages.length === 0) return nil;

  let value = evaluateCommand(pipeline.stages[0]!, context, undefined);
  for (let index = 1; index < pipeline.stages.length; index++) {
    value = evaluateCommand(pipeline.stages[index]!, context, value);
  }
  return value;
}

function evaluateCommand(
  command: Command,
  context: TemplateEvaluationContext,
  piped: TemplateValue | undefined,
): TemplateValue {
  if (command.args.length === 0 && piped === undefined) {
    return evaluateExpression(command.head, context);
  }

  const head = command.head;
  if (head instanceof TokenExpr) {
    const args: TemplateValue[] = [];
    for (let index = 0; index < command.args.length; index++) {
      args.push(evaluateExpression(command.args[index]!, context));
    }
    if (piped !== undefined) args.push(piped);
    return callTemplateFunction(
      head.token,
      args,
      context.scope,
      context.environment,
      context.overrides,
      context.defines,
    );
  }

  if (head instanceof AccessExpr && head.segments.length > 0) {
    let receiver = evaluateExpression(head.base, context);
    if (head.segments.length > 1) {
      const receiverSegments: string[] = [];
      for (let index = 0; index < head.segments.length - 1; index++) {
        receiverSegments.push(head.segments[index]!);
      }
      receiver = resolvePath(receiver, receiverSegments, context.scope);
    }

    const args: TemplateValue[] = [];
    for (let index = 0; index < command.args.length; index++) {
      args.push(evaluateExpression(command.args[index]!, context));
    }
    if (piped !== undefined) args.push(piped);
    return callMethod(
      receiver,
      head.segments[head.segments.length - 1]!,
      args,
      context.scope,
      context.environment,
      context.overrides,
      context.defines,
    );
  }

  if (piped !== undefined) return piped;
  return evaluateExpression(head, context);
}

function evaluateExpression(expression: Expr, context: TemplateEvaluationContext): TemplateValue {
  if (expression instanceof TokenExpr) {
    const token = expression.token.trim();
    if (
      token === "." ||
      token === "$" ||
      token.startsWith(".") ||
      token.startsWith("$") ||
      token.startsWith("site") ||
      token === "hugo.Sites" ||
      token.startsWith("hugo.Sites.") ||
      token === "page" ||
      token.startsWith("page.") ||
      parseStringLiteral(token) !== undefined ||
      token === "true" ||
      token === "false" ||
      isNumberLiteral(token)
    ) {
      return evalToken(token, context.scope);
    }
    return callTemplateFunction(
      token,
      [],
      context.scope,
      context.environment,
      context.overrides,
      context.defines,
    );
  }

  if (expression instanceof PipelineExpr) {
    return evaluatePipeline(
      expression.pipeline,
      context.scope,
      context.environment,
      context.overrides,
      context.defines,
    );
  }

  if (expression instanceof CommandExpr) {
    return evaluateCommand(expression.command, context, undefined);
  }

  if (expression instanceof AccessExpr) {
    const value = evaluateExpression(expression.base, context);
    return resolvePath(value, expression.segments, context.scope);
  }

  throw createTsumoError("TSUMO_TEMPLATE_EXPRESSION_INVALID", "The parsed template expression has no supported evaluation form");
}
