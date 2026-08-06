import type { TemplateEnvironment } from "../environment.js";
import type { TemplateNode } from "../nodes.js";
import type { RenderScope } from "../scope.js";

export class TemplateFunctionContext {
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
