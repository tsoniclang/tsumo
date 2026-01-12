import { MediaType } from "../../models.ts";
import { TemplateValue } from "./base.ts";

export class MediaTypeValue extends TemplateValue {
  readonly value: MediaType;

  constructor(value: MediaType) {
    super();
    this.value = value;
  }
}
