import { TemplateValue } from "./base.js";

export class DictValue extends TemplateValue {
  value: Map<string, TemplateValue>;

  constructor(value: Map<string, TemplateValue>) {
    super();
    this.value = value;
  }
}
