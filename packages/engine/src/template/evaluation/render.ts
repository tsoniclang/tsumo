import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { createTsumoError } from "../../diagnostics.js";
import { compareText } from "../../utils/strings.js";
import type { TemplateEnvironment } from "../environment.js";
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
import { RenderScope } from "../scope.js";
import { isTruthy, stringify } from "../runtime-helpers.js";
import {
  AnyArrayValue,
  DeferredTemplateValue,
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

export type TemplateOutputMode = "html" | "text";
export type TemplateControlFlow = "normal" | "break" | "continue";

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

const createControlScope = (
  parent: RenderScope,
  dot: TemplateValue,
  binding: TemplateVariableBinding | undefined,
  value: TemplateValue,
): RenderScope => {
  const scope = new RenderScope(parent.root, dot, parent.site, parent.env, parent);
  if (binding !== undefined) {
    if (binding.declare) scope.declareVar(binding.name, value);
    else scope.assignVar(binding.name, value);
  }
  return scope;
};

export const renderTemplateNodes = (
  nodes: TemplateNode[],
  output: StringBuilder,
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
  outputMode: TemplateOutputMode,
): TemplateControlFlow => {
  for (let index = 0; index < nodes.length; index++) {
    const control = renderTemplateNode(nodes[index]!, output, scope, environment, overrides, defines, outputMode);
    if (control !== "normal") return control;
  }
  return "normal";
};

export const renderTemplateNode = (
  node: TemplateNode,
  output: StringBuilder,
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
  outputMode: TemplateOutputMode,
): TemplateControlFlow => {
  if (node instanceof TextNode) {
    output.Append(node.text);
    return "normal";
  }
  if (node instanceof OutputNode) {
    output.Append(stringify(
      evaluatePipeline(node.pipeline, scope, environment, overrides, defines),
      outputMode === "html" && node.escape,
    ));
    return "normal";
  }
  if (node instanceof AssignmentNode) {
    const value = evaluatePipeline(node.pipeline, scope, environment, overrides, defines);
    if (node.declare) scope.declareVar(node.name, value);
    else scope.assignVar(node.name, value);
    return "normal";
  }
  if (node instanceof BreakNode) {
    return "break";
  }
  if (node instanceof ContinueNode) {
    return "continue";
  }
  if (node instanceof TemplateInvokeNode) {
    const context = evaluatePipeline(node.context, scope, environment, overrides, defines);
    const dot = context instanceof NilValue ? scope.dot : context;
    const invokedNodes = overrides.get(node.name) ?? defines.get(node.name);
    if (invokedNodes === undefined) {
      const invokedTemplate = environment.getTemplate(node.name);
      if (invokedTemplate === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFINITION_MISSING",
          `Template definition '${node.name}' was not found`,
          scope.templateSourcePath,
        );
      }
      const selected = invokedTemplate.withInheritedDefinitions(defines);
      output.Append(outputMode === "html"
        ? environment.renderTemplate(selected, dot, scope.site, overrides, scope.state)
        : environment.renderTextTemplate(selected, dot, scope.site, overrides, scope.state));
      return "normal";
    }
    const invokedScope = new RenderScope(
      dot,
      dot,
      scope.site,
      scope.env,
      undefined,
      scope.state,
      scope.templateSourcePath,
    );
    const control = renderTemplateNodes(invokedNodes, output, invokedScope, environment, overrides, defines, outputMode);
    if (control !== "normal") {
      throw createTsumoError("TSUMO_TEMPLATE_CONTROL_FLOW_INVALID", "Template invocation cannot transfer loop control to its caller");
    }
    return "normal";
  }
  if (node instanceof IfNode) {
    const condition = evaluatePipeline(node.condition, scope, environment, overrides, defines);
    const blockScope = createControlScope(scope, scope.dot, node.binding, condition);
    return renderTemplateNodes(
      isTruthy(condition) ? node.thenNodes : node.elseNodes,
      output,
      blockScope,
      environment,
      overrides,
      defines,
      outputMode,
    );
  }
  if (node instanceof RangeNode) {
    const range = toRangeValues(evaluatePipeline(node.expr, scope, environment, overrides, defines));
    if (range === undefined || range.values.length === 0) {
      return renderTemplateNodes(node.elseBody, output, scope, environment, overrides, defines, outputMode);
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
      const control = renderTemplateNodes(node.body, output, itemScope, environment, overrides, defines, outputMode);
      if (control === "break") return "normal";
      if (control === "continue") continue;
    }
    return "normal";
  }
  if (node instanceof WithNode) {
    const value = evaluatePipeline(node.expr, scope, environment, overrides, defines);
    if (value instanceof DeferredTemplateValue) {
      const deferred = value as DeferredTemplateValue;
      output.Append(environment.registerDeferredTemplate(
        deferred,
        node.body,
        defines,
        scope.templateSourcePath,
        node.sourceText,
        node.sourceSegmentIndex,
        scope.site,
        overrides,
        scope.state,
      ));
      return "normal";
    }
    const nestedScope = createControlScope(scope, isTruthy(value) ? value : scope.dot, node.binding, value);
    if (!isTruthy(value)) {
      return renderTemplateNodes(node.elseBody, output, nestedScope, environment, overrides, defines, outputMode);
    }
    return renderTemplateNodes(node.body, output, nestedScope, environment, overrides, defines, outputMode);
  }
  if (node instanceof BlockNode) {
    const context = evaluatePipeline(node.context, scope, environment, overrides, defines);
    const dot = context instanceof NilValue ? scope.dot : context;
    const nestedScope = new RenderScope(scope.root, dot, scope.site, scope.env, scope);
    const control = renderTemplateNodes(
      overrides.get(node.name) ?? node.fallback,
      output,
      nestedScope,
      environment,
      overrides,
      defines,
      outputMode,
    );
    if (control !== "normal") {
      throw createTsumoError("TSUMO_TEMPLATE_CONTROL_FLOW_INVALID", "Template block cannot transfer loop control to its caller");
    }
    return "normal";
  }

  throw createTsumoError("TSUMO_TEMPLATE_NODE_INVALID", "The parsed template contains an unsupported node kind");
};
