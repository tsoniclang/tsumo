import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { ParamValue } from "../params.ts";
import type { PageContext } from "./page-context.ts";

export class MenuEntry {
  readonly name: string;
  readonly url: string;
  readonly pageRef: string;
  readonly title: string;
  readonly weight: int;
  readonly parent: string;
  readonly identifier: string;
  readonly pre: string;
  readonly post: string;
  readonly menu: string;
  readonly Params: Dictionary<string, ParamValue>;
  page: PageContext | undefined;
  children: MenuEntry[];

  constructor(
    name: string,
    url: string,
    pageRef: string,
    title: string,
    weight: int,
    parent: string,
    identifier: string,
    pre: string,
    post: string,
    menu: string,
    params?: Dictionary<string, ParamValue>,
  ) {
    this.name = name;
    this.url = url;
    this.pageRef = pageRef;
    this.title = title;
    this.weight = weight;
    this.parent = parent;
    this.identifier = identifier;
    this.pre = pre;
    this.post = post;
    this.menu = menu;
    this.Params = params ?? new Dictionary<string, ParamValue>();
    this.page = undefined;
    const empty: MenuEntry[] = [];
    this.children = empty;
  }
}
