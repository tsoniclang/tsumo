import type { DocsMountContext, NavItem } from "../../docs/models.ts";
import { TemplateValue } from "./base.ts";

export class DocsMountValue extends TemplateValue {
  value: DocsMountContext;

  constructor(value: DocsMountContext) {
    super();
    this.value = value;
  }
}

export class DocsMountArrayValue extends TemplateValue {
  value: DocsMountContext[];

  constructor(value: DocsMountContext[]) {
    super();
    this.value = value;
  }
}

export class NavItemValue extends TemplateValue {
  value: NavItem;

  constructor(value: NavItem) {
    super();
    this.value = value;
  }
}

export class NavArrayValue extends TemplateValue {
  value: NavItem[];

  constructor(value: NavItem[]) {
    super();
    this.value = value;
  }
}
