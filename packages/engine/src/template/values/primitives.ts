import type { int } from "@tsonic/csharp/types.js";
import { HtmlString } from "../../utils/html.js";
import { TemplateValue } from "./base.js";

export class StringValue extends TemplateValue {
  value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }
}

export class BoolValue extends TemplateValue {
  value: boolean;

  constructor(value: boolean) {
    super();
    this.value = value;
  }
}

export class NumberValue extends TemplateValue {
  value: int;

  constructor(value: int) {
    super();
    this.value = value;
  }
}

export class HtmlValue extends TemplateValue {
  value: HtmlString;

  constructor(value: HtmlString) {
    super();
    this.value = value;
  }
}
