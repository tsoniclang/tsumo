import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { TemplateValue } from "./base.ts";

export class StringArrayValue extends TemplateValue {
  value: string[];

  constructor(value: string[]) {
    super();
    this.value = value;
  }
}

export class AnyArrayValue extends TemplateValue {
  value: List<TemplateValue>;

  constructor(value: List<TemplateValue>) {
    super();
    this.value = value;
  }
}
