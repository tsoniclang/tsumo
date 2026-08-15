import { PageContext, SiteContext } from "../models.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../diagnostics.js";
import { PageValue, PaginatorValue, TemplateValue } from "./values.js";
import type { TemplateEnvironment } from "./environment.js";

export class RenderScope {
  root: TemplateValue;
  dot: TemplateValue;
  site: SiteContext;
  env: TemplateEnvironment;
  parent: RenderScope | undefined;
  vars: Map<string, TemplateValue>;
  state: RenderState;
  templateSourcePath: string | undefined;

  constructor(
    root: TemplateValue,
    dot: TemplateValue,
    site: SiteContext,
    env: TemplateEnvironment,
    parent: RenderScope | undefined,
    state: RenderState | undefined = undefined,
    templateSourcePath: string | undefined = undefined,
  ) {
    this.root = root;
    this.dot = dot;
    this.site = site;
    this.env = env;
    this.parent = parent;
    this.vars = new Map<string, TemplateValue>();
    this.state = parent?.state ?? state ?? new RenderState(1);
    if (this.state.currentPage === undefined && root instanceof PageValue) {
      this.state.currentPage = root.value;
    }
    this.templateSourcePath = templateSourcePath ?? parent?.templateSourcePath;
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

  getPaginator(): PaginatorValue | undefined {
    return this.state.selectedPaginator;
  }

  selectPaginator(paginator: PaginatorValue): PaginatorValue {
    const existing = this.state.selectedPaginator;
    if (existing !== undefined) {
      if (!existing.hasSameSource(paginator)) {
        throw createTsumoError("TSUMO_TEMPLATE_PAGINATION_CONFLICT", "A rendered page cannot select more than one pagination source");
      }
      return existing;
    }
    this.state.selectedPaginator = paginator;
    return paginator;
  }
}

export class RenderState {
  paginationPageNumber: int32;
  selectedPaginator: PaginatorValue | undefined;
  currentPage: PageContext | undefined;

  constructor(paginationPageNumber: int32) {
    this.paginationPageNumber = paginationPageNumber > 0 ? paginationPageNumber : 1;
    this.selectedPaginator = undefined;
    this.currentPage = undefined;
  }
}
