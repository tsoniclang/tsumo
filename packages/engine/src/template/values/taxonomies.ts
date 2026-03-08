import { PageContext, SiteContext } from "../../models.ts";
import { TemplateValue } from "./base.ts";

export class TaxonomiesValue extends TemplateValue {
  readonly site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class TaxonomyTermsValue extends TemplateValue {
  readonly terms: Map<string, PageContext[]>;
  readonly site: SiteContext;

  constructor(terms: Map<string, PageContext[]>, site: SiteContext) {
    super();
    this.terms = terms;
    this.site = site;
  }
}
