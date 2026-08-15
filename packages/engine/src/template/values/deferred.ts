import { TemplateValue } from "./base.js";

export class DeferredTemplateValue extends TemplateValue {
  key: string | undefined;
  data: TemplateValue;

  constructor(key: string | undefined, data: TemplateValue) {
    super();
    this.key = key;
    this.data = data;
  }
}
