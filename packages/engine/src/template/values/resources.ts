import { Resource, ResourceData } from "../../resources.ts";
import type { ResourceManager } from "../../resources.ts";
import { TemplateValue } from "./base.ts";

export class ResourceDataValue extends TemplateValue {
  value: ResourceData;

  constructor(value: ResourceData) {
    super();
    this.value = value;
  }
}

export class ResourceValue extends TemplateValue {
  value: Resource;
  manager: ResourceManager;

  constructor(manager: ResourceManager, value: Resource) {
    super();
    this.manager = manager;
    this.value = value;
  }
}
