import { SiteContext } from "../models.js";
import { TemplateValue } from "./values.js";
import type { TemplateEnvironment } from "./environment.js";

export class RenderScope {
  root: TemplateValue;
  dot: TemplateValue;
  site: SiteContext;
  env: TemplateEnvironment;
  parent: RenderScope | undefined;
  vars: Map<string, TemplateValue>;

  constructor(root: TemplateValue, dot: TemplateValue, site: SiteContext, env: TemplateEnvironment, parent: RenderScope | undefined) {
    this.root = root;
    this.dot = dot;
    this.site = site;
    this.env = env;
    this.parent = parent;
    this.vars = new Map<string, TemplateValue>();
  }

  getVar(name: string): TemplateValue | undefined {
    let cur: RenderScope | undefined = this;
    while (cur !== undefined) {
      const value = cur.vars.get(name);
      if (value !== undefined) return value;
      cur = cur.parent;
    }
    return undefined;
  }

  declareVar(name: string, value: TemplateValue): void {
    this.vars.set(name, value);
  }

  assignVar(name: string, value: TemplateValue): void {
    let cur: RenderScope | undefined = this;
    while (cur !== undefined) {
      if (cur.vars.has(name)) {
        cur.vars.set(name, value);
        return;
      }
      cur = cur.parent;
    }
    this.declareVar(name, value);
  }
}
