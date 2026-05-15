import type { int } from "@tsonic/core/types.js";
import { ParamValue } from "../params.ts";
import type { PageContext } from "./page-context.ts";

export class MenuEntry {
  name: string;
  url: string;
  pageRef: string;
  title: string;
  weight: int;
  parent: string;
  identifier: string;
  pre: string;
  post: string;
  menu: string;
  Params: Map<string, ParamValue>;
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
    params?: Map<string, ParamValue>,
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
    this.Params = params ?? new Map<string, ParamValue>();
    this.page = undefined;
    const empty: MenuEntry[] = [];
    this.children = empty;
  }
}
