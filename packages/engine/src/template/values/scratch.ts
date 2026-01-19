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
    let v: TemplateValue = new NilValue();
    return this.values.TryGetValue(key, v) ? v : new NilValue();
  }

  set(key: string, value: TemplateValue): void {
    this.values.Remove(key);
    this.values.Add(key, value);
  }

  add(key: string, value: TemplateValue): void {
    let cur: TemplateValue = new NilValue();
    const has = this.values.TryGetValue(key, cur);
    if (!has) {
      this.set(key, value);
      return;
    }
    if (cur instanceof AnyArrayValue) {
      const curArray = cur as AnyArrayValue;
      const mergedList = new List<TemplateValue>();
      const it = curArray.value.GetEnumerator();
      while (it.MoveNext()) mergedList.Add(it.Current);
      if (value instanceof AnyArrayValue) {
        const valueArray = value as AnyArrayValue;
        const vit = valueArray.value.GetEnumerator();
        while (vit.MoveNext()) mergedList.Add(vit.Current);
      } else {
        mergedList.Add(value);
      }
      this.set(key, new AnyArrayValue(mergedList));
      return;
    }
    const pairList = new List<TemplateValue>();
    pairList.Add(cur);
    pairList.Add(value);
    this.set(key, new AnyArrayValue(pairList));
  }

  delete(key: string): void {
    this.values.Remove(key);
  }

  setInMap(mapName: string, key: string, value: TemplateValue): void {
    let cur: TemplateValue = new NilValue();
    const has = this.values.TryGetValue(mapName, cur);
    if (has) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.Remove(key);
        dict.value.Add(key, value);
        return;
      }
    }
    const map = new Dictionary<string, TemplateValue>();
    map.Remove(key);
    map.Add(key, value);
    this.values.Remove(mapName);
    this.values.Add(mapName, new DictValue(map));
  }

  deleteInMap(mapName: string, key: string): void {
    let cur: TemplateValue = new NilValue();
    const has = this.values.TryGetValue(mapName, cur);
    if (has) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.Remove(key);
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
