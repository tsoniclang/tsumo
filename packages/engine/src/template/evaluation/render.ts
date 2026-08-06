import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { createTsumoError } from "../../diagnostics.js";
import { compareText } from "../../utils/strings.js";
import type { TemplateEnvironment } from "../environment.js";
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
import { RenderScope } from "../scope.js";
import { isTruthy, stringify } from "../runtime-helpers.js";
import {
  AnyArrayValue,
  DictValue,
  DocsMountArrayValue,
  DocsMountValue,
  MenuArrayValue,
  MenuEntryValue,
  NavArrayValue,
  NavItemValue,
  NilValue,
  NumberValue,
  PageArrayValue,
  PageValue,
  SiteValue,
  SitesArrayValue,
  StringArrayValue,
  StringValue,
  TemplateValue,
} from "../values.js";
import { evaluatePipeline } from "./evaluate.js";

class TemplateRangeValues {
  keys: TemplateValue[];
  values: TemplateValue[];

  constructor(keys: TemplateValue[], values: TemplateValue[]) {
    this.keys = keys;
    this.values = values;
  }
}

const arrayKeys = (length: number): TemplateValue[] => {
  const keys: TemplateValue[] = [];
  for (let index = 0; index < length; index++) keys.push(new NumberValue(index));
  return keys;
};

const toRangeValues = (value: TemplateValue): TemplateRangeValues | undefined => {
  const values: TemplateValue[] = [];
  if (value instanceof PageArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(new PageValue(value.value[index]!));
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof StringArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(new StringValue(value.value[index]!));
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof DocsMountArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(new DocsMountValue(value.value[index]!));
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof NavArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(new NavItemValue(value.value[index]!));
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof SitesArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(new SiteValue(value.value[index]!));
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof MenuArrayValue) {
    for (let index = 0; index < value.value.length; index++) {
      values.push(new MenuEntryValue(value.value[index]!, value.site));
    }
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof AnyArrayValue) {
    for (let index = 0; index < value.value.length; index++) values.push(value.value[index]!);
    return new TemplateRangeValues(arrayKeys(values.length), values);
  }
  if (value instanceof DictValue) {
    const names: string[] = [];
    for (const name of value.value.keys()) names.push(name);
    names.sort((left, right) => compareText(left, right));
    const keys: TemplateValue[] = [];
    for (let index = 0; index < names.length; index++) {
      const name = names[index]!;
      const item = value.value.get(name);
      if (item === undefined) continue;
      keys.push(new StringValue(name));
      values.push(item);
    }
    return new TemplateRangeValues(keys, values);
  }
  return undefined;
};

export const renderTemplateNodes = (
  nodes: TemplateNode[],
  output: StringBuilder,
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
): void => {
  for (let index = 0; index < nodes.length; index++) {
    renderTemplateNode(nodes[index]!, output, scope, environment, overrides, defines);
  }
};

export const renderTemplateNode = (
  node: TemplateNode,
  output: StringBuilder,
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
): void => {
  if (node instanceof TextNode) {
    output.Append(node.text);
    return;
  }
  if (node instanceof OutputNode) {
    output.Append(stringify(evaluatePipeline(node.pipeline, scope, environment, overrides, defines), node.escape));
    return;
  }
  if (node instanceof AssignmentNode) {
    const value = evaluatePipeline(node.pipeline, scope, environment, overrides, defines);
    if (node.declare) scope.declareVar(node.name, value);
    else scope.assignVar(node.name, value);
    return;
  }
  if (node instanceof TemplateInvokeNode) {
    const context = evaluatePipeline(node.context, scope, environment, overrides, defines);
    const dot = context instanceof NilValue ? scope.dot : context;
    const invokedNodes = overrides.get(node.name) ?? defines.get(node.name);
    if (invokedNodes === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_DEFINITION_MISSING", `Template definition '${node.name}' was not found`);
    }
    const invokedScope = new RenderScope(dot, dot, scope.site, scope.env, undefined);
    renderTemplateNodes(invokedNodes, output, invokedScope, environment, overrides, defines);
    return;
  }
  if (node instanceof IfNode) {
    const condition = evaluatePipeline(node.condition, scope, environment, overrides, defines);
    renderTemplateNodes(
      isTruthy(condition) ? node.thenNodes : node.elseNodes,
      output,
      scope,
      environment,
      overrides,
      defines,
    );
    return;
  }
  if (node instanceof RangeNode) {
    const range = toRangeValues(evaluatePipeline(node.expr, scope, environment, overrides, defines));
    if (range === undefined || range.values.length === 0) {
      renderTemplateNodes(node.elseBody, output, scope, environment, overrides, defines);
      return;
    }
    for (let index = 0; index < range.values.length; index++) {
      const value = range.values[index]!;
      const itemScope = new RenderScope(scope.root, value, scope.site, scope.env, scope);
      const valueVariable = node.valueVar;
      const keyVariable = node.keyVar;
      if (valueVariable !== undefined) itemScope.declareVar(valueVariable, value);
      if (keyVariable !== undefined && valueVariable !== undefined) {
        itemScope.declareVar(keyVariable, range.keys[index]!);
      }
      renderTemplateNodes(node.body, output, itemScope, environment, overrides, defines);
    }
    return;
  }
  if (node instanceof WithNode) {
    const value = evaluatePipeline(node.expr, scope, environment, overrides, defines);
    if (!isTruthy(value)) {
      renderTemplateNodes(node.elseBody, output, scope, environment, overrides, defines);
      return;
    }
    const nestedScope = new RenderScope(scope.root, value, scope.site, scope.env, scope);
    renderTemplateNodes(node.body, output, nestedScope, environment, overrides, defines);
    return;
  }
  if (node instanceof BlockNode) {
    const context = evaluatePipeline(node.context, scope, environment, overrides, defines);
    const dot = context instanceof NilValue ? scope.dot : context;
    const nestedScope = new RenderScope(scope.root, dot, scope.site, scope.env, scope);
    renderTemplateNodes(overrides.get(node.name) ?? node.fallback, output, nestedScope, environment, overrides, defines);
    return;
  }

  throw createTsumoError("TSUMO_TEMPLATE_NODE_INVALID", "The parsed template contains an unsupported node kind");
};
