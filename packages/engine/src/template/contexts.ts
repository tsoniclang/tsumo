import type { int } from "@tsonic/core/types.js";
import { PageContext, SiteContext } from "../models.ts";
import { ParamValue } from "../params.ts";
import { innerDeindent } from "../shortcode.ts";
import { parseInt32 } from "../utils/int32.ts";
import { TemplateValue } from "./values.ts";

export class ShortcodeContext {
  name: string;
  Page: PageContext;
  Site: SiteContext;
  Params: Map<string, ParamValue>;
  positionalParams: string[];
  IsNamedParams: boolean;
  Inner: string;
  InnerDeindent: string;
  Ordinal: int;
  Parent: ShortcodeContext | undefined;

  constructor(
    name: string,
    page: PageContext,
    site: SiteContext,
    params: Map<string, ParamValue>,
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
      return this.Params.get(keyOrIndex);
    }
    const idx = parseInt32(keyOrIndex);
    if (idx !== undefined && idx >= 0 && idx < this.positionalParams.length) {
      return ParamValue.string(this.positionalParams[idx]!);
    }
    return undefined;
  }
}

export class ShortcodeValue extends TemplateValue {
  value: ShortcodeContext;

  constructor(value: ShortcodeContext) {
    super();
    this.value = value;
  }
}

export class LinkHookContext {
  Destination: string;
  Text: string;
  Title: string;
  PlainText: string;
  Page: PageContext;

  constructor(destination: string, text: string, title: string, plainText: string, page: PageContext) {
    this.Destination = destination;
    this.Text = text;
    this.Title = title;
    this.PlainText = plainText;
    this.Page = page;
  }
}

export class LinkHookValue extends TemplateValue {
  value: LinkHookContext;

  constructor(value: LinkHookContext) {
    super();
    this.value = value;
  }
}

export class ImageHookContext {
  Destination: string;
  Text: string;
  Title: string;
  PlainText: string;
  Page: PageContext;

  constructor(destination: string, text: string, title: string, plainText: string, page: PageContext) {
    this.Destination = destination;
    this.Text = text;
    this.Title = title;
    this.PlainText = plainText;
    this.Page = page;
  }
}

export class ImageHookValue extends TemplateValue {
  value: ImageHookContext;

  constructor(value: ImageHookContext) {
    super();
    this.value = value;
  }
}

export class HeadingHookContext {
  Level: int;
  Text: string;
  PlainText: string;
  Anchor: string;
  Page: PageContext;

  constructor(level: int, text: string, plainText: string, anchor: string, page: PageContext) {
    this.Level = level;
    this.Text = text;
    this.PlainText = plainText;
    this.Anchor = anchor;
    this.Page = page;
  }
}

export class HeadingHookValue extends TemplateValue {
  value: HeadingHookContext;

  constructor(value: HeadingHookContext) {
    super();
    this.value = value;
  }
}
