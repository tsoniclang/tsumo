import type { int } from "@tsonic/core/types.js";

export class FrontMatterMenu {
  readonly menu: string;
  name: string;
  weight: int;
  parent: string;
  identifier: string;
  pre: string;
  post: string;
  title: string;

  constructor(menu: string) {
    this.menu = menu;
    this.name = "";
    this.weight = 0;
    this.parent = "";
    this.identifier = "";
    this.pre = "";
    this.post = "";
    this.title = "";
  }
}
