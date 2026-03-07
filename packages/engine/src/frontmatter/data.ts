import { ParamValue } from "../params.ts";
import { FrontMatterMenu } from "./menu.ts";

export class FrontMatter {
  title: string | undefined;
  date: Date | undefined;
  draft: boolean;
  tags: string[];
  categories: string[];
  description: string | undefined;
  slug: string | undefined;
  layout: string | undefined;
  type: string | undefined;
  Params: Map<string, ParamValue>;
  menus: FrontMatterMenu[];

  constructor() {
    this.title = undefined;
    this.date = undefined;
    this.draft = false;
    const emptyStrings: string[] = [];
    this.tags = emptyStrings;
    this.categories = emptyStrings;
    this.description = undefined;
    this.slug = undefined;
    this.layout = undefined;
    this.type = undefined;
    this.Params = new Map<string, ParamValue>();
    const emptyMenus: FrontMatterMenu[] = [];
    this.menus = emptyMenus;
  }
}
