import { MenuEntry, SiteContext } from "../../models.ts";
import { TemplateValue } from "./base.ts";

export class MenuEntryValue extends TemplateValue {
  value: MenuEntry;
  site: SiteContext;

  constructor(value: MenuEntry, site: SiteContext) {
    super();
    this.value = value;
    this.site = site;
  }
}

export class MenuArrayValue extends TemplateValue {
  value: MenuEntry[];
  site: SiteContext;

  constructor(value: MenuEntry[], site: SiteContext) {
    super();
    this.value = value;
    this.site = site;
  }
}

export class MenusValue extends TemplateValue {
  site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}
