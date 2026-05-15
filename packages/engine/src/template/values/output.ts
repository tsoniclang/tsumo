import { OutputFormat, SiteContext } from "../../models.ts";
import { TemplateValue } from "./base.ts";

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
