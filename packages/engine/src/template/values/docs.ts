import type { DocsMountContext, NavItem } from "../../docs/models.ts";
import { TemplateValue } from "./base.ts";

export class DocsMountValue extends TemplateValue {
  readonly value: DocsMountContext;

  constructor(value: DocsMountContext) {
    super();
    this.value = value;
  }
}

export class DocsMountArrayValue extends TemplateValue {
  readonly value: DocsMountContext[];

  constructor(value: DocsMountContext[]) {
    super();
    this.value = value;
  }
}

export class NavItemValue extends TemplateValue {
  readonly value: NavItem;

  constructor(value: NavItem) {
    super();
    this.value = value;
  }
}

export class NavArrayValue extends TemplateValue {
  readonly value: NavItem[];

  constructor(value: NavItem[]) {
    super();
    this.value = value;
  }
}
