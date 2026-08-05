import { PageContext, SiteContext } from "../../models.js";
import { TemplateValue } from "./base.js";

export class TaxonomiesValue extends TemplateValue {
  site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class TaxonomyTermsValue extends TemplateValue {
  terms: Map<string, PageContext[]>;
  site: SiteContext;

  constructor(terms: Map<string, PageContext[]>, site: SiteContext) {
    super();
    this.terms = terms;
    this.site = site;
  }
}
