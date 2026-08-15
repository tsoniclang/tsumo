import { LanguageContext, MediaType, PageContext, SiteContext } from "../../models.js";
import { ParamKind, ParamValue } from "../../params.js";
import { compareText } from "../../utils/strings.js";
import {
  AnyArrayValue, BoolValue, DictValue, LanguageValue, MediaTypeValue, NumberValue,
  PageArrayValue, ScratchStore, StringValue, TemplateValue,
} from "../values.js";

const pageStores = new Map<PageContext, ScratchStore>();
const siteStores = new Map<SiteContext, ScratchStore>();

export const taxonomyTermsByCount = (terms: Map<string, PageContext[]>): AnyArrayValue => {
  const names = Array.from(terms.keys());
  for (let left = 0; left < names.length; left++) {
    for (let right = left + 1; right < names.length; right++) {
      const leftName = names[left]!;
      const rightName = names[right]!;
      const leftCount = terms.get(leftName)?.length ?? 0;
      const rightCount = terms.get(rightName)?.length ?? 0;
      if (leftCount > rightCount || (leftCount === rightCount && compareText(leftName, rightName) <= 0)) continue;
      names[left] = rightName;
      names[right] = leftName;
    }
  }

  const values: TemplateValue[] = [];
  for (let index = 0; index < names.length; index++) {
    const name = names[index]!;
    const pages = terms.get(name);
    if (pages === undefined) continue;
    const fields = new Map<string, TemplateValue>();
    fields.set("Name", new StringValue(name));
    fields.set("Count", new NumberValue(pages.length));
    fields.set("Pages", new PageArrayValue(pages));
    values.push(new DictValue(fields));
  }
  return new AnyArrayValue(values);
};

export const wrapParamDict = (dict: Map<string, ParamValue>): DictValue => {
  const mapped = new Map<string, TemplateValue>();
  for (const key of dict.keys()) {
    const value = dict.get(key);
    if (value === undefined) continue;
    let wrapped: TemplateValue = new StringValue(value.stringValue);
    if (value.kind === ParamKind.Bool) wrapped = new BoolValue(value.boolValue);
    if (value.kind === ParamKind.Number) wrapped = new NumberValue(value.numberValue);
    mapped.set(key, wrapped);
  }
  return new DictValue(mapped);
};

export const wrapLanguages = (languages: LanguageContext[]): AnyArrayValue => {
  const items: TemplateValue[] = [];
  for (let index = 0; index < languages.length; index++) items.push(new LanguageValue(languages[index]!));
  return new AnyArrayValue(items);
};

export const wrapMediaType = (mediaType: MediaType): MediaTypeValue => new MediaTypeValue(mediaType);

export const getPageStore = (page: PageContext): ScratchStore => {
  const existing = pageStores.get(page);
  if (existing !== undefined) return existing;
  const store = new ScratchStore();
  pageStores.set(page, store);
  return store;
};

export const getSiteStore = (site: SiteContext): ScratchStore => {
  const existing = siteStores.get(site);
  if (existing !== undefined) return existing;
  const store = new ScratchStore();
  siteStores.set(site, store);
  return store;
};
