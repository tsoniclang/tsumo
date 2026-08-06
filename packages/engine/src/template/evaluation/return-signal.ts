import { Exception } from "@tsonic/dotnet/System.js";
import type { TemplateValue } from "../values.js";

export class TemplateReturnSignal extends Exception {
  value: TemplateValue;

  constructor(value: TemplateValue) {
    super("template return");
    this.value = value;
  }
}
