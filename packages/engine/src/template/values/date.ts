import { TemplateValue } from "./base.js";

export class DateValue extends TemplateValue {
  value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }
}
