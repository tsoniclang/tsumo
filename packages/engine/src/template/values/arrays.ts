import { TemplateValue } from "./base.js";

export class StringArrayValue extends TemplateValue {
  value: string[];

  constructor(value: string[]) {
    super();
    this.value = value;
  }
}

export class AnyArrayValue extends TemplateValue {
  value: TemplateValue[];

  constructor(value: TemplateValue[]) {
    super();
    this.value = value;
  }
}
