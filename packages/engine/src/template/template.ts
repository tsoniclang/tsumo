import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { createTsumoError } from "../diagnostics.js";
import { PageContext } from "../models.js";
import { PageValue } from "./values.js";
import { RenderScope, RenderState } from "./scope.js";
import type { TemplateEnvironment } from "./environment.js";
import { TemplateNode } from "./nodes.js";
import { renderTemplateNodes } from "./evaluation/render.js";

export class Template {
  nodes: TemplateNode[];
  defines: Map<string, TemplateNode[]>;
  sourcePath: string | undefined;

  constructor(nodes: TemplateNode[], defines: Map<string, TemplateNode[]>, sourcePath: string | undefined = undefined) {
    this.nodes = nodes;
    this.defines = defines;
    this.sourcePath = sourcePath;
  }

  withInheritedDefinitions(inherited: Map<string, TemplateNode[]>): Template {
    if (inherited.size === 0) return this;
    const definitions = new Map<string, TemplateNode[]>();
    for (const name of inherited.keys()) {
      const inheritedBody = inherited.get(name);
      if (inheritedBody === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFINE_INVENTORY_INVALID",
          `Inherited template definition '${name}' has no body`,
          this.sourcePath,
        );
      }
      definitions.set(name, inheritedBody);
    }
    for (const name of this.defines.keys()) {
      const body = this.defines.get(name);
      if (body === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFINE_INVENTORY_INVALID",
          `Template definition '${name}' has no body`,
          this.sourcePath,
        );
      }
      const existing = definitions.get(name);
      if (existing !== undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_DEFINE_CONFLICT",
          `Template definition '${name}' conflicts with an inherited definition`,
          this.sourcePath,
        );
      }
      definitions.set(name, body);
    }
    return new Template(this.nodes, definitions, this.sourcePath);
  }

  render(root: PageContext, env: TemplateEnvironment, overrides?: Map<string, TemplateNode[]>, state?: RenderState): string {
    const sb = new StringBuilder();
    const pageValue = new PageValue(root);
    const scope = new RenderScope(pageValue, pageValue, root.site, env, undefined, state, this.sourcePath);
    const defs = overrides ?? new Map<string, TemplateNode[]>();
    this.renderInto(sb, scope, env, defs);
    return sb.ToString();
  }

  renderInto(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Map<string, TemplateNode[]>): void {
    const control = renderTemplateNodes(this.nodes, sb, scope, env, overrides, this.defines, "html");
    if (control !== "normal") {
      throw createTsumoError("TSUMO_TEMPLATE_CONTROL_FLOW_INVALID", "Template loop control escaped the checked template root");
    }
  }

  renderTextInto(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Map<string, TemplateNode[]>): void {
    const control = renderTemplateNodes(this.nodes, sb, scope, env, overrides, this.defines, "text");
    if (control !== "normal") {
      throw createTsumoError("TSUMO_TEMPLATE_CONTROL_FLOW_INVALID", "Template loop control escaped the checked template root");
    }
  }
}
