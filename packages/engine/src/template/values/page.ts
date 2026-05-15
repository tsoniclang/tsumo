import { PageContext, PageFile } from "../../models.ts";
import type { ResourceManager } from "../../resources.ts";
import { TemplateValue } from "./base.ts";

export class PageValue extends TemplateValue {
  value: PageContext;

  constructor(value: PageContext) {
    super();
    this.value = value;
  }
}

export class FileValue extends TemplateValue {
  value: PageFile;

  constructor(value: PageFile) {
    super();
    this.value = value;
  }
}

export class PageArrayValue extends TemplateValue {
  value: PageContext[];

  constructor(value: PageContext[]) {
    super();
    this.value = value;
  }
}

export class PageResourcesValue extends TemplateValue {
  page: PageContext;
  manager: ResourceManager;

  constructor(page: PageContext, manager: ResourceManager) {
    super();
    this.page = page;
    this.manager = manager;
  }
}
