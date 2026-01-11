import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { PageContext } from "../models.ts";
import { PageValue } from "./values.ts";
import { RenderScope } from "./scope.ts";
import type { TemplateEnvironment } from "./environment.ts";
import { TemplateNode } from "./nodes.ts";

export class Template {
  readonly nodes: TemplateNode[];
  readonly defines: Dictionary<string, TemplateNode[]>;

  constructor(nodes: TemplateNode[], defines: Dictionary<string, TemplateNode[]>) {
    this.nodes = nodes;
    this.defines = defines;
  }

  render(root: PageContext, env: TemplateEnvironment, overrides?: Dictionary<string, TemplateNode[]>): string {
    const sb = new StringBuilder();
    const pageValue = new PageValue(root);
    const scope = new RenderScope(pageValue, pageValue, root.site, env, undefined);
    const defs = overrides ?? new Dictionary<string, TemplateNode[]>();
    this.renderInto(sb, scope, env, defs);
    return sb.toString();
  }

  renderInto(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i]!.render(sb, scope, env, overrides, this.defines);
    }
  }
}
