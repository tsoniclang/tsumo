import { replaceText } from "./strings.ts";

export const escapeHtml = (input: string): string => {
  let s = input;
  s = replaceText(s, "&", "&amp;");
  s = replaceText(s, "<", "&lt;");
  s = replaceText(s, ">", "&gt;");
  s = replaceText(s, "\"", "&quot;");
  s = replaceText(s, "'", "&#39;");
  return s;
};

export class HtmlString {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}
