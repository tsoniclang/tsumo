import { LanguageContext, SiteContext } from "../../models.ts";
import { TemplateValue } from "./base.ts";

export class SiteValue extends TemplateValue {
  readonly value: SiteContext;

  constructor(value: SiteContext) {
    super();
    this.value = value;
  }
}

export class LanguageValue extends TemplateValue {
  readonly value: LanguageContext;

  constructor(value: LanguageContext) {
    super();
    this.value = value;
  }
}

export class SitesValue extends TemplateValue {
  readonly value: SiteContext;

  constructor(value: SiteContext) {
    super();
    this.value = value;
  }
}

export class SitesArrayValue extends TemplateValue {
  readonly value: SiteContext[];

  constructor(value: SiteContext[]) {
    super();
    this.value = value;
  }
}
