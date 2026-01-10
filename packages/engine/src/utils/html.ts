export const escapeHtml = (input: string): string => {
  let s = input;
  s = s.replace("&", "&amp;");
  s = s.replace("<", "&lt;");
  s = s.replace(">", "&gt;");
  s = s.replace("\"", "&quot;");
  s = s.replace("'", "&#39;");
  return s;
};

export class HtmlString {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}

