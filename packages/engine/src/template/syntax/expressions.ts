export class Expr {}

export class TokenExpr extends Expr {
  token: string;

  constructor(token: string) {
    super();
    this.token = token;
  }
}

export class PipelineExpr extends Expr {
  pipeline: Pipeline;

  constructor(pipeline: Pipeline) {
    super();
    this.pipeline = pipeline;
  }
}

export class CommandExpr extends Expr {
  command: Command;

  constructor(command: Command) {
    super();
    this.command = command;
  }
}

export class AccessExpr extends Expr {
  base: Expr;
  segments: string[];

  constructor(base: Expr, segments: string[]) {
    super();
    this.base = base;
    this.segments = segments;
  }
}

export class Command {
  head: Expr;
  args: Expr[];

  constructor(head: Expr, args: Expr[]) {
    this.head = head;
    this.args = args;
  }
}

export class Pipeline {
  stages: Command[];

  constructor(stages: Command[]) {
    this.stages = stages;
  }
}
