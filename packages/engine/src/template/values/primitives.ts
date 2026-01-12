import type { int } from "@tsonic/core/types.js";
import { HtmlString } from "../../utils/html.ts";
import { TemplateValue } from "./base.ts";

export class StringValue extends TemplateValue {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }
}

export class BoolValue extends TemplateValue {
  readonly value: boolean;

  constructor(value: boolean) {
    super();
    this.value = value;
  }
}

export class NumberValue extends TemplateValue {
  readonly value: int;

  constructor(value: int) {
    super();
    this.value = value;
  }
}

export class HtmlValue extends TemplateValue {
  readonly value: HtmlString;

  constructor(value: HtmlString) {
    super();
    this.value = value;
  }
}
