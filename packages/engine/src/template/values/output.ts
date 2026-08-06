import { OutputFormat, SiteContext } from "../../models.js";
import { TemplateValue } from "./base.js";

export class OutputFormatsValue extends TemplateValue {
  site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class OutputFormatValue extends TemplateValue {
  value: OutputFormat;

  constructor(value: OutputFormat) {
    super();
    this.value = value;
  }
}

export class OutputFormatsGetValue extends TemplateValue {
  site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}
