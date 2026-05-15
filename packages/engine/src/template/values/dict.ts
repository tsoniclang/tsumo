import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { TemplateValue } from "./base.ts";

export class DictValue extends TemplateValue {
  value: Dictionary<string, TemplateValue>;

  constructor(value: Dictionary<string, TemplateValue>) {
    super();
    this.value = value;
  }
}
