import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
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
  readonly terms: Dictionary<string, PageContext[]>;
  readonly site: SiteContext;

  constructor(terms: Dictionary<string, PageContext[]>, site: SiteContext) {
    super();
    this.terms = terms;
    this.site = site;
  }
}
