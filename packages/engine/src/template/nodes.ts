import type { int32 } from "@tsonic/core/types.js";
import type { Pipeline } from "./syntax/expressions.js";

export class TemplateNode {}

export class TextNode extends TemplateNode {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }
}

export class OutputNode extends TemplateNode {
  pipeline: Pipeline;
  escape: boolean;

  constructor(pipeline: Pipeline, escape: boolean) {
    super();
    this.pipeline = pipeline;
    this.escape = escape;
  }
}

export class AssignmentNode extends TemplateNode {
  name: string;
  pipeline: Pipeline;
  declare: boolean;

  constructor(name: string, pipeline: Pipeline, declare: boolean) {
    super();
    this.name = name;
    this.pipeline = pipeline;
    this.declare = declare;
  }
}

export class TemplateInvokeNode extends TemplateNode {
  name: string;
  context: Pipeline;

  constructor(name: string, context: Pipeline) {
    super();
    this.name = name;
    this.context = context;
  }
}

export class TemplateVariableBinding {
  name: string;
  declare: boolean;

  constructor(name: string, declare: boolean) {
    this.name = name;
    this.declare = declare;
  }
}

export class IfNode extends TemplateNode {
  condition: Pipeline;
  binding: TemplateVariableBinding | undefined;
  thenNodes: TemplateNode[];
  elseNodes: TemplateNode[];

  constructor(
    condition: Pipeline,
    binding: TemplateVariableBinding | undefined,
    thenNodes: TemplateNode[],
    elseNodes: TemplateNode[],
  ) {
    super();
    this.condition = condition;
    this.binding = binding;
    this.thenNodes = thenNodes;
    this.elseNodes = elseNodes;
  }
}

export class RangeNode extends TemplateNode {
  expr: Pipeline;
  keyVar: string | undefined;
  valueVar: string | undefined;
  body: TemplateNode[];
  elseBody: TemplateNode[];

  constructor(
    expr: Pipeline,
    keyVar: string | undefined,
    valueVar: string | undefined,
    body: TemplateNode[],
    elseBody: TemplateNode[],
  ) {
    super();
    this.expr = expr;
    this.keyVar = keyVar;
    this.valueVar = valueVar;
    this.body = body;
    this.elseBody = elseBody;
  }
}

export class WithNode extends TemplateNode {
  expr: Pipeline;
  binding: TemplateVariableBinding | undefined;
  body: TemplateNode[];
  elseBody: TemplateNode[];
  sourceText: string;
  sourceSegmentIndex: int32;

  constructor(
    expr: Pipeline,
    binding: TemplateVariableBinding | undefined,
    body: TemplateNode[],
    elseBody: TemplateNode[],
    sourceText: string,
    sourceSegmentIndex: int32,
  ) {
    super();
    this.expr = expr;
    this.binding = binding;
    this.body = body;
    this.elseBody = elseBody;
    this.sourceText = sourceText;
    this.sourceSegmentIndex = sourceSegmentIndex;
  }
}

export class BlockNode extends TemplateNode {
  name: string;
  context: Pipeline;
  fallback: TemplateNode[];

  constructor(name: string, context: Pipeline, fallback: TemplateNode[]) {
    super();
    this.name = name;
    this.context = context;
    this.fallback = fallback;
  }
}
