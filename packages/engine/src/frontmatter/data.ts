import { DateTime } from "@tsonic/dotnet/System.js";
import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { ParamValue } from "../params.ts";
import { FrontMatterMenu } from "./menu.ts";

export class FrontMatter {
  title: string | undefined;
  date: DateTime | undefined;
  draft: boolean;
  tags: string[];
  categories: string[];
  description: string | undefined;
  slug: string | undefined;
  layout: string | undefined;
  type: string | undefined;
  Params: Dictionary<string, ParamValue>;
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
    this.Params = new Dictionary<string, ParamValue>();
    const emptyMenus: FrontMatterMenu[] = [];
    this.menus = emptyMenus;
  }
}
