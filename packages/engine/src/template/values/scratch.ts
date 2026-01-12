import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { TemplateValue, NilValue } from "./base.ts";
import { DictValue } from "./dict.ts";
import { AnyArrayValue } from "./arrays.ts";

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
