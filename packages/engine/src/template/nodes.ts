import { Exception } from "@tsonic/dotnet/System.js";
import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import type { DocsMountContext, NavItem } from "../docs/models.ts";
import { MenuEntry, PageContext, SiteContext } from "../models.ts";
import {
  TemplateValue, NilValue, StringValue, NumberValue, PageValue, SiteValue,
  DocsMountValue, DocsMountArrayValue, NavItemValue, NavArrayValue,
  MenuEntryValue, MenuArrayValue, PageArrayValue, StringArrayValue,
  SitesArrayValue, AnyArrayValue, DictValue,
} from "./values.ts";
import { RenderScope } from "./scope.ts";
import type { TemplateEnvironment } from "./environment.ts";
import { nil, isTruthy, stringify } from "./runtime-helpers.ts";
import type { Pipeline } from "./runtime.ts";

export class TemplateNode {
  render(
    _sb: StringBuilder,
    _scope: RenderScope,
    _env: TemplateEnvironment,
    _overrides: Dictionary<string, TemplateNode[]>,
    _defines: Dictionary<string, TemplateNode[]>,
  ): void {
    throw new Exception("TemplateNode.render is not implemented");
  }
}

export class TextNode extends TemplateNode {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  override render(
    sb: StringBuilder,
    _scope: RenderScope,
    _env: TemplateEnvironment,
    _overrides: Dictionary<string, TemplateNode[]>,
    _defines: Dictionary<string, TemplateNode[]>,
  ): void {
    sb.Append(this.text);
  }
}

export class OutputNode extends TemplateNode {
  readonly pipeline: Pipeline;
  readonly escape: boolean;

  constructor(pipeline: Pipeline, escape: boolean) {
    super();
    this.pipeline = pipeline;
    this.escape = escape;
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const value = this.pipeline.eval(scope, env, overrides, defines);
    sb.Append(stringify(value, this.escape));
  }
}

export class AssignmentNode extends TemplateNode {
  readonly name: string;
  readonly pipeline: Pipeline;
  readonly declare: boolean;

  constructor(name: string, pipeline: Pipeline, declare: boolean) {
    super();
    this.name = name;
    this.pipeline = pipeline;
    this.declare = declare;
  }

  override render(
    _sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const value = this.pipeline.eval(scope, env, overrides, defines);
    if (this.declare) scope.declareVar(this.name, value);
    else scope.assignVar(this.name, value);
  }
}

export class TemplateInvokeNode extends TemplateNode {
  readonly name: string;
  readonly context: Pipeline;

  constructor(name: string, context: Pipeline) {
    super();
    this.name = name;
    this.context = context;
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const ctx = this.context.eval(scope, env, overrides, defines);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    let nodes: TemplateNode[] = [];
    const hasOverride = overrides.TryGetValue(this.name, nodes);
    if (!hasOverride) {
      const hasLocal = defines.TryGetValue(this.name, nodes);
      if (!hasLocal) return;
    }

    const nextScope = new RenderScope(dot, dot, scope.site, scope.env, undefined);
    for (let i = 0; i < nodes.Length; i++) nodes[i]!.render(sb, nextScope, env, overrides, defines);
  }
}

export class IfNode extends TemplateNode {
  readonly condition: Pipeline;
  readonly thenNodes: TemplateNode[];
  readonly elseNodes: TemplateNode[];

  constructor(condition: Pipeline, thenNodes: TemplateNode[], elseNodes: TemplateNode[]) {
    super();
    this.condition = condition;
    this.thenNodes = thenNodes;
    this.elseNodes = elseNodes;
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const value = this.condition.eval(scope, env, overrides, defines);
    if (isTruthy(value)) {
      for (let i = 0; i < this.thenNodes.Length; i++) this.thenNodes[i]!.render(sb, scope, env, overrides, defines);
      return;
    }
    for (let i = 0; i < this.elseNodes.Length; i++) this.elseNodes[i]!.render(sb, scope, env, overrides, defines);
  }
}

export class RangeNode extends TemplateNode {
  readonly expr: Pipeline;
  readonly keyVar: string | undefined;
  readonly valueVar: string | undefined;
  readonly body: TemplateNode[];
  readonly elseBody: TemplateNode[];

  constructor(expr: Pipeline, keyVar: string | undefined, valueVar: string | undefined, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.keyVar = keyVar;
    this.valueVar = valueVar;
    this.body = body;
    this.elseBody = elseBody;
  }

  private renderBody(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>, defines: Dictionary<string, TemplateNode[]>): void {
    for (let j = 0; j < this.body.Length; j++) this.body[j]!.render(sb, scope, env, overrides, defines);
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const value = this.expr.eval(scope, env, overrides, defines);

    if (value instanceof PageArrayValue) {
      const pages: PageContext[] = value.value;
      if (pages.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < pages.Length; i++) {
        const valueScope = new RenderScope(scope.root, new PageValue(pages[i]!), scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, new PageValue(pages[i]!));
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof StringArrayValue) {
      const items: string[] = value.value;
      if (items.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.Length; i++) {
        const itemValue = new StringValue(items[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof DocsMountArrayValue) {
      const mounts: DocsMountContext[] = value.value;
      if (mounts.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < mounts.Length; i++) {
        const itemValue = new DocsMountValue(mounts[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof NavArrayValue) {
      const items: NavItem[] = value.value;
      if (items.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.Length; i++) {
        const itemValue = new NavItemValue(items[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof SitesArrayValue) {
      const sites: SiteContext[] = value.value;
      if (sites.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < sites.Length; i++) {
        const itemValue = new SiteValue(sites[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof MenuArrayValue) {
      const items: MenuEntry[] = value.value;
      const site = value.site;
      if (items.Length === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.Length; i++) {
        const itemValue = new MenuEntryValue(items[i]!, site);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof AnyArrayValue) {
      const items = value.value;
      if (items.Count === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      const it = items.GetEnumerator();
      let index: int = 0;
      while (it.MoveNext()) {
        const itemValue = it.Current;
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, itemValue);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new NumberValue(index));
        this.renderBody(sb, valueScope, env, overrides, defines);
        index++;
      }
      return;
    }

    if (value instanceof DictValue) {
      if (value.value.Count === 0) {
        for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      const it = value.value.GetEnumerator();
      while (it.MoveNext()) {
        const kv = it.Current;
        const k = kv.Key;
        const v = kv.Value;
        const valueScope = new RenderScope(scope.root, v, scope.site, scope.env, scope);
        if (this.valueVar !== undefined) valueScope.declareVar(this.valueVar, v);
        if (this.keyVar !== undefined && this.valueVar !== undefined) valueScope.declareVar(this.keyVar, new StringValue(k));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
  }
}

export class WithNode extends TemplateNode {
  readonly expr: Pipeline;
  readonly body: TemplateNode[];
  readonly elseBody: TemplateNode[];

  constructor(expr: Pipeline, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.body = body;
    this.elseBody = elseBody;
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    const value = this.expr.eval(scope, env, overrides, defines);
    if (isTruthy(value)) {
      const nextScope = new RenderScope(scope.root, value, scope.site, scope.env, scope);
      for (let i = 0; i < this.body.Length; i++) this.body[i]!.render(sb, nextScope, env, overrides, defines);
      return;
    }
    for (let i = 0; i < this.elseBody.Length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
  }
}

export class BlockNode extends TemplateNode {
  readonly name: string;
  readonly context: Pipeline;
  readonly fallback: TemplateNode[];

  constructor(name: string, context: Pipeline, fallback: TemplateNode[]) {
    super();
    this.name = name;
    this.context = context;
    this.fallback = fallback;
  }

  override render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Dictionary<string, TemplateNode[]>,
    defines: Dictionary<string, TemplateNode[]>,
  ): void {
    let overrideNodes: TemplateNode[] = [];
    const hasOverride = overrides.TryGetValue(this.name, overrideNodes);
    const ctx = this.context.eval(scope, env, overrides, defines);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    const nextScope = new RenderScope(scope.root, dot, scope.site, scope.env, scope);

    if (hasOverride) {
      for (let i = 0; i < overrideNodes.Length; i++) overrideNodes[i]!.render(sb, nextScope, env, overrides, defines);
      return;
    }

    for (let i = 0; i < this.fallback.Length; i++) this.fallback[i]!.render(sb, nextScope, env, overrides, defines);
  }
}
