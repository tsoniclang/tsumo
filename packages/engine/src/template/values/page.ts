import { PageContext, PageFile } from "../../models.js";
import type { ResourceManager } from "../../resources.js";
import { TemplateValue } from "./base.js";

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

export class PageDataValue extends TemplateValue {
  page: PageContext;

  constructor(page: PageContext) {
    super();
    this.page = page;
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
