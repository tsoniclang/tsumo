import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { SiteContext } from "../models.ts";
import { TemplateValue, NilValue } from "./values.ts";
import type { TemplateEnvironment } from "./environment.ts";

export class RenderScope {
  readonly root: TemplateValue;
  readonly dot: TemplateValue;
  readonly site: SiteContext;
  readonly env: TemplateEnvironment;
  readonly parent: RenderScope | undefined;
  readonly vars: Dictionary<string, TemplateValue>;

  constructor(root: TemplateValue, dot: TemplateValue, site: SiteContext, env: TemplateEnvironment, parent: RenderScope | undefined) {
    this.root = root;
    this.dot = dot;
    this.site = site;
    this.env = env;
    this.parent = parent;
    this.vars = new Dictionary<string, TemplateValue>();
  }

  getVar(name: string): TemplateValue | undefined {
    let cur: RenderScope | undefined = this;
    while (cur !== undefined) {
      const value: TemplateValue = new NilValue();
      if (cur.vars.tryGetValue(name, value)) return value;
      cur = cur.parent;
    }
    return undefined;
  }

  declareVar(name: string, value: TemplateValue): void {
    this.vars.remove(name);
    this.vars.add(name, value);
  }

  assignVar(name: string, value: TemplateValue): void {
    let cur: RenderScope | undefined = this;
    while (cur !== undefined) {
      const existing: TemplateValue = new NilValue();
      const has = cur.vars.tryGetValue(name, existing);
      if (has) {
        cur.vars.remove(name);
        cur.vars.add(name, value);
        return;
      }
      cur = cur.parent;
    }
    this.declareVar(name, value);
  }
}
