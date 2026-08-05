import { Exception } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/csharp/types.js";
import type { DocsMountContext, NavItem } from "../docs/models.js";
import { MenuEntry, PageContext, SiteContext } from "../models.js";
import {
  TemplateValue, NilValue, StringValue, NumberValue, PageValue, SiteValue,
  DocsMountValue, DocsMountArrayValue, NavItemValue, NavArrayValue,
  MenuEntryValue, MenuArrayValue, PageArrayValue, StringArrayValue,
  SitesArrayValue, AnyArrayValue, DictValue,
} from "./values.js";
import { RenderScope } from "./scope.js";
import type { TemplateEnvironment } from "./environment.js";
import { nil, isTruthy, stringify } from "./runtime-helpers.js";
import type { Pipeline } from "./runtime.js";

export class TemplateNode {
  render(
    _sb: StringBuilder,
    _scope: RenderScope,
    _env: TemplateEnvironment,
    _overrides: Map<string, TemplateNode[]>,
    _defines: Map<string, TemplateNode[]>,
  ): void {
    throw new Exception("TemplateNode.render is not implemented");
  }
}

export class TextNode extends TemplateNode {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  render(
    sb: StringBuilder,
    _scope: RenderScope,
    _env: TemplateEnvironment,
    _overrides: Map<string, TemplateNode[]>,
    _defines: Map<string, TemplateNode[]>,
  ): void {
    sb.Append(this.text);
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

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const value = this.pipeline.eval(scope, env, overrides, defines);
    sb.Append(stringify(value, this.escape));
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

  render(
    _sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const value = this.pipeline.eval(scope, env, overrides, defines);
    if (this.declare) scope.declareVar(this.name, value);
    else scope.assignVar(this.name, value);
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

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const ctx = this.context.eval(scope, env, overrides, defines);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    let nodes = overrides.get(this.name);
    if (nodes === undefined) {
      nodes = defines.get(this.name);
      if (nodes === undefined) return;
    }

    const nextScope = new RenderScope(dot, dot, scope.site, scope.env, undefined);
    for (let i = 0; i < nodes.length; i++) nodes[i]!.render(sb, nextScope, env, overrides, defines);
  }
}

export class IfNode extends TemplateNode {
  condition: Pipeline;
  thenNodes: TemplateNode[];
  elseNodes: TemplateNode[];

  constructor(condition: Pipeline, thenNodes: TemplateNode[], elseNodes: TemplateNode[]) {
    super();
    this.condition = condition;
    this.thenNodes = thenNodes;
    this.elseNodes = elseNodes;
  }

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const value = this.condition.eval(scope, env, overrides, defines);
    if (isTruthy(value)) {
      for (let i = 0; i < this.thenNodes.length; i++) this.thenNodes[i]!.render(sb, scope, env, overrides, defines);
      return;
    }
    for (let i = 0; i < this.elseNodes.length; i++) this.elseNodes[i]!.render(sb, scope, env, overrides, defines);
  }
}

export class RangeNode extends TemplateNode {
  expr: Pipeline;
  keyVar: string | undefined;
  valueVar: string | undefined;
  body: TemplateNode[];
  elseBody: TemplateNode[];

  constructor(expr: Pipeline, keyVar: string | undefined, valueVar: string | undefined, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.keyVar = keyVar;
    this.valueVar = valueVar;
    this.body = body;
    this.elseBody = elseBody;
  }

  renderBody(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Map<string, TemplateNode[]>, defines: Map<string, TemplateNode[]>): void {
    for (let j = 0; j < this.body.length; j++) this.body[j]!.render(sb, scope, env, overrides, defines);
  }

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const value = this.expr.eval(scope, env, overrides, defines);
    const keyVar = this.keyVar;
    const valueVar = this.valueVar;

    if (value instanceof PageArrayValue) {
      const pages: PageContext[] = value.value;
      if (pages.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const valueScope = new RenderScope(scope.root, new PageValue(pages[i]!), scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, new PageValue(pages[i]!));
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof StringArrayValue) {
      const items: string[] = value.value;
      if (items.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const itemValue = new StringValue(items[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof DocsMountArrayValue) {
      const mounts: DocsMountContext[] = value.value;
      if (mounts.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < mounts.length; i++) {
        const itemValue = new DocsMountValue(mounts[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof NavArrayValue) {
      const items: NavItem[] = value.value;
      if (items.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const itemValue = new NavItemValue(items[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof SitesArrayValue) {
      const sites: SiteContext[] = value.value;
      if (sites.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < sites.length; i++) {
        const itemValue = new SiteValue(sites[i]!);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof MenuArrayValue) {
      const items: MenuEntry[] = value.value;
      const site = value.site;
      if (items.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const itemValue = new MenuEntryValue(items[i]!, site);
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(i));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof AnyArrayValue) {
      const items = value.value;
      if (items.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (let index = 0; index < items.length; index++) {
        const itemValue = items[index]!;
        const valueScope = new RenderScope(scope.root, itemValue, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, itemValue);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new NumberValue(index));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    if (value instanceof DictValue) {
      if (value.value.size === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
        return;
      }
      for (const k of value.value.keys()) {
        const v = value.value.get(k);
        if (v === undefined) continue;
        const valueScope = new RenderScope(scope.root, v, scope.site, scope.env, scope);
        if (valueVar !== undefined) valueScope.declareVar(valueVar, v);
        if (keyVar !== undefined && valueVar !== undefined) valueScope.declareVar(keyVar, new StringValue(k));
        this.renderBody(sb, valueScope, env, overrides, defines);
      }
      return;
    }

    for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
  }
}

export class WithNode extends TemplateNode {
  expr: Pipeline;
  body: TemplateNode[];
  elseBody: TemplateNode[];

  constructor(expr: Pipeline, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.body = body;
    this.elseBody = elseBody;
  }

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const value = this.expr.eval(scope, env, overrides, defines);
    if (isTruthy(value)) {
      const nextScope = new RenderScope(scope.root, value, scope.site, scope.env, scope);
      for (let i = 0; i < this.body.length; i++) this.body[i]!.render(sb, nextScope, env, overrides, defines);
      return;
    }
    for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides, defines);
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

  render(
    sb: StringBuilder,
    scope: RenderScope,
    env: TemplateEnvironment,
    overrides: Map<string, TemplateNode[]>,
    defines: Map<string, TemplateNode[]>,
  ): void {
    const overrideNodes = overrides.get(this.name);
    const ctx = this.context.eval(scope, env, overrides, defines);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    const nextScope = new RenderScope(scope.root, dot, scope.site, scope.env, scope);

    if (overrideNodes !== undefined) {
      for (let i = 0; i < overrideNodes.length; i++) overrideNodes[i]!.render(sb, nextScope, env, overrides, defines);
      return;
    }

    for (let i = 0; i < this.fallback.length; i++) this.fallback[i]!.render(sb, nextScope, env, overrides, defines);
  }
}
