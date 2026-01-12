import { Uri } from "@tsonic/dotnet/System.js";
import { TemplateValue } from "./base.ts";

export class UrlParts {
  readonly path: string;
  readonly rawQuery: string;
  readonly fragment: string;

  constructor(path: string, rawQuery: string, fragment: string) {
    this.path = path;
    this.rawQuery = rawQuery;
    this.fragment = fragment;
  }
}

export class UrlValue extends TemplateValue {
  readonly value: Uri;

  constructor(value: Uri) {
    super();
    this.value = value;
  }
}
