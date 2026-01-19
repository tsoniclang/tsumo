import { Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { PageContext, SiteContext } from "../models.ts";
import { ParamValue } from "../params.ts";
import { innerDeindent } from "../shortcode.ts";
import { TemplateValue } from "./values.ts";

export class ShortcodeContext {
  readonly name: string;
  readonly Page: PageContext;
  readonly Site: SiteContext;
  readonly Params: Dictionary<string, ParamValue>;
  readonly positionalParams: string[];
  readonly IsNamedParams: boolean;
  readonly Inner: string;
  readonly InnerDeindent: string;
  readonly Ordinal: int;
  readonly Parent: ShortcodeContext | undefined;

  constructor(
    name: string,
    page: PageContext,
    site: SiteContext,
    params: Dictionary<string, ParamValue>,
    positionalParams: string[],
    isNamedParams: boolean,
    inner: string,
    ordinal: int,
    parent: ShortcodeContext | undefined,
  ) {
    this.name = name;
    this.Page = page;
    this.Site = site;
    this.Params = params;
    this.positionalParams = positionalParams;
    this.IsNamedParams = isNamedParams;
    this.Inner = inner;
    this.InnerDeindent = innerDeindent(inner);
    this.Ordinal = ordinal;
    this.Parent = parent;
  }

  Get(keyOrIndex: string): ParamValue | undefined {
    if (this.IsNamedParams) {
      let value: ParamValue = ParamValue.string("");
      const found = this.Params.TryGetValue(keyOrIndex, value);
      return found ? value : undefined;
    }
    let idx: int = 0;
    const parsed = Int32.TryParse(keyOrIndex, idx);
    if (parsed && idx >= 0 && idx < this.positionalParams.Length) {
      return ParamValue.string(this.positionalParams[idx]!);
    }
    return undefined;
  }
}

export class ShortcodeValue extends TemplateValue {
  readonly value: ShortcodeContext;

  constructor(value: ShortcodeContext) {
    super();
    this.value = value;
  }
}

export class LinkHookContext {
  readonly Destination: string;
  readonly Text: string;
  readonly Title: string;
  readonly PlainText: string;
  readonly Page: PageContext;

  constructor(destination: string, text: string, title: string, plainText: string, page: PageContext) {
    this.Destination = destination;
    this.Text = text;
    this.Title = title;
    this.PlainText = plainText;
    this.Page = page;
  }
}

export class LinkHookValue extends TemplateValue {
  readonly value: LinkHookContext;

  constructor(value: LinkHookContext) {
    super();
    this.value = value;
  }
}

export class ImageHookContext {
  readonly Destination: string;
  readonly Text: string;
  readonly Title: string;
  readonly PlainText: string;
  readonly Page: PageContext;

  constructor(destination: string, text: string, title: string, plainText: string, page: PageContext) {
    this.Destination = destination;
    this.Text = text;
    this.Title = title;
    this.PlainText = plainText;
    this.Page = page;
  }
}

export class ImageHookValue extends TemplateValue {
  readonly value: ImageHookContext;

  constructor(value: ImageHookContext) {
    super();
    this.value = value;
  }
}

export class HeadingHookContext {
  readonly Level: int;
  readonly Text: string;
  readonly PlainText: string;
  readonly Anchor: string;
  readonly Page: PageContext;

  constructor(level: int, text: string, plainText: string, anchor: string, page: PageContext) {
    this.Level = level;
    this.Text = text;
    this.PlainText = plainText;
    this.Anchor = anchor;
    this.Page = page;
  }
}

export class HeadingHookValue extends TemplateValue {
  readonly value: HeadingHookContext;

  constructor(value: HeadingHookContext) {
    super();
    this.value = value;
  }
}
