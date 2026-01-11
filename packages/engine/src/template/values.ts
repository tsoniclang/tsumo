import { Uri } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { int } from "@tsonic/core/types.js";
import { HtmlString } from "../utils/html.ts";
import { LanguageContext, MediaType, MenuEntry, OutputFormat, PageContext, PageFile, SiteContext } from "../models.ts";
import type { DocsMountContext, NavItem } from "../docs/models.ts";
import { Resource, ResourceData } from "../resources.ts";
import type { ResourceManager } from "../resources.ts";

export class TemplateValue {}

export class NilValue extends TemplateValue {}

export class StringValue extends TemplateValue {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }
}

export class BoolValue extends TemplateValue {
  readonly value: boolean;

  constructor(value: boolean) {
    super();
    this.value = value;
  }
}

export class NumberValue extends TemplateValue {
  readonly value: int;

  constructor(value: int) {
    super();
    this.value = value;
  }
}

export class HtmlValue extends TemplateValue {
  readonly value: HtmlString;

  constructor(value: HtmlString) {
    super();
    this.value = value;
  }
}

export class PageValue extends TemplateValue {
  readonly value: PageContext;

  constructor(value: PageContext) {
    super();
    this.value = value;
  }
}

export class SiteValue extends TemplateValue {
  readonly value: SiteContext;

  constructor(value: SiteContext) {
    super();
    this.value = value;
  }
}

export class LanguageValue extends TemplateValue {
  readonly value: LanguageContext;

  constructor(value: LanguageContext) {
    super();
    this.value = value;
  }
}

export class FileValue extends TemplateValue {
  readonly value: PageFile;

  constructor(value: PageFile) {
    super();
    this.value = value;
  }
}

export class SitesValue extends TemplateValue {
  readonly value: SiteContext;

  constructor(value: SiteContext) {
    super();
    this.value = value;
  }
}

export class ResourceDataValue extends TemplateValue {
  readonly value: ResourceData;

  constructor(value: ResourceData) {
    super();
    this.value = value;
  }
}

export class ResourceValue extends TemplateValue {
  readonly value: Resource;
  readonly manager: ResourceManager;

  constructor(manager: ResourceManager, value: Resource) {
    super();
    this.manager = manager;
    this.value = value;
  }
}

export class PageResourcesValue extends TemplateValue {
  readonly page: PageContext;
  readonly manager: ResourceManager;

  constructor(page: PageContext, manager: ResourceManager) {
    super();
    this.page = page;
    this.manager = manager;
  }
}

export class PageArrayValue extends TemplateValue {
  readonly value: PageContext[];

  constructor(value: PageContext[]) {
    super();
    this.value = value;
  }
}

export class StringArrayValue extends TemplateValue {
  readonly value: string[];

  constructor(value: string[]) {
    super();
    this.value = value;
  }
}

export class SitesArrayValue extends TemplateValue {
  readonly value: SiteContext[];

  constructor(value: SiteContext[]) {
    super();
    this.value = value;
  }
}

export class AnyArrayValue extends TemplateValue {
  readonly value: List<TemplateValue>;

  constructor(value: List<TemplateValue>) {
    super();
    this.value = value;
  }
}

export class DocsMountValue extends TemplateValue {
  readonly value: DocsMountContext;

  constructor(value: DocsMountContext) {
    super();
    this.value = value;
  }
}

export class DocsMountArrayValue extends TemplateValue {
  readonly value: DocsMountContext[];

  constructor(value: DocsMountContext[]) {
    super();
    this.value = value;
  }
}

export class NavItemValue extends TemplateValue {
  readonly value: NavItem;

  constructor(value: NavItem) {
    super();
    this.value = value;
  }
}

export class NavArrayValue extends TemplateValue {
  readonly value: NavItem[];

  constructor(value: NavItem[]) {
    super();
    this.value = value;
  }
}

export class MenuEntryValue extends TemplateValue {
  readonly value: MenuEntry;
  readonly site: SiteContext;

  constructor(value: MenuEntry, site: SiteContext) {
    super();
    this.value = value;
    this.site = site;
  }
}

export class MenuArrayValue extends TemplateValue {
  readonly value: MenuEntry[];
  readonly site: SiteContext;

  constructor(value: MenuEntry[], site: SiteContext) {
    super();
    this.value = value;
    this.site = site;
  }
}

export class MenusValue extends TemplateValue {
  readonly site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class OutputFormatsValue extends TemplateValue {
  readonly site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class OutputFormatValue extends TemplateValue {
  readonly value: OutputFormat;

  constructor(value: OutputFormat) {
    super();
    this.value = value;
  }
}

export class TaxonomiesValue extends TemplateValue {
  readonly site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class TaxonomyTermsValue extends TemplateValue {
  readonly terms: Dictionary<string, PageContext[]>;
  readonly site: SiteContext;

  constructor(terms: Dictionary<string, PageContext[]>, site: SiteContext) {
    super();
    this.terms = terms;
    this.site = site;
  }
}

export class OutputFormatsGetValue extends TemplateValue {
  readonly site: SiteContext;

  constructor(site: SiteContext) {
    super();
    this.site = site;
  }
}

export class MediaTypeValue extends TemplateValue {
  readonly value: MediaType;

  constructor(value: MediaType) {
    super();
    this.value = value;
  }
}

export class DictValue extends TemplateValue {
  readonly value: Dictionary<string, TemplateValue>;

  constructor(value: Dictionary<string, TemplateValue>) {
    super();
    this.value = value;
  }
}

export class ScratchStore {
  private readonly values: Dictionary<string, TemplateValue>;

  constructor() {
    this.values = new Dictionary<string, TemplateValue>();
  }

  getValues(): DictValue {
    return new DictValue(this.values);
  }

  get(key: string): TemplateValue {
    const v: TemplateValue = new NilValue();
    return this.values.tryGetValue(key, v) ? v : new NilValue();
  }

  set(key: string, value: TemplateValue): void {
    this.values.remove(key);
    this.values.add(key, value);
  }

  add(key: string, value: TemplateValue): void {
    const cur: TemplateValue = new NilValue();
    const has = this.values.tryGetValue(key, cur);
    if (!has) {
      this.set(key, value);
      return;
    }
    if (cur instanceof AnyArrayValue) {
      const curArray = cur as AnyArrayValue;
      const mergedList = new List<TemplateValue>();
      const it = curArray.value.getEnumerator();
      while (it.moveNext()) mergedList.add(it.current);
      if (value instanceof AnyArrayValue) {
        const valueArray = value as AnyArrayValue;
        const vit = valueArray.value.getEnumerator();
        while (vit.moveNext()) mergedList.add(vit.current);
      } else {
        mergedList.add(value);
      }
      this.set(key, new AnyArrayValue(mergedList));
      return;
    }
    const pairList = new List<TemplateValue>();
    pairList.add(cur);
    pairList.add(value);
    this.set(key, new AnyArrayValue(pairList));
  }

  delete(key: string): void {
    this.values.remove(key);
  }

  setInMap(mapName: string, key: string, value: TemplateValue): void {
    const cur: TemplateValue = new NilValue();
    const has = this.values.tryGetValue(mapName, cur);
    if (has) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.remove(key);
        dict.value.add(key, value);
        return;
      }
    }
    const map = new Dictionary<string, TemplateValue>();
    map.remove(key);
    map.add(key, value);
    this.values.remove(mapName);
    this.values.add(mapName, new DictValue(map));
  }

  deleteInMap(mapName: string, key: string): void {
    const cur: TemplateValue = new NilValue();
    const has = this.values.tryGetValue(mapName, cur);
    if (has) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.remove(key);
      }
    }
  }
}

export class ScratchValue extends TemplateValue {
  readonly value: ScratchStore;

  constructor(value: ScratchStore) {
    super();
    this.value = value;
  }
}

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
