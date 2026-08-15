import { Resource, ResourceData } from "../../resources.js";
import type { ResourceManager } from "../../resources.js";
import { TemplateValue } from "./base.js";

export class ResourceNamespaceValue extends TemplateValue {}

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
