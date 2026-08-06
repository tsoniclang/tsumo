import { MediaType } from "../../models.js";
import { TemplateValue } from "./base.js";

export class MediaTypeValue extends TemplateValue {
  value: MediaType;

  constructor(value: MediaType) {
    super();
    this.value = value;
  }
}
