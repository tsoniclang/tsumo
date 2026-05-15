import { MediaType } from "../../models.ts";
import { TemplateValue } from "./base.ts";

export class MediaTypeValue extends TemplateValue {
  value: MediaType;

  constructor(value: MediaType) {
    super();
    this.value = value;
  }
}
