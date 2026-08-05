import { TemplateValue, NilValue } from "./base.js";
import { DictValue } from "./dict.js";
import { AnyArrayValue } from "./arrays.js";

export class ScratchStore {
  values: Map<string, TemplateValue>;

  constructor() {
    this.values = new Map<string, TemplateValue>();
  }

  getValues(): DictValue {
    return new DictValue(this.values);
  }

  get(key: string): TemplateValue {
    const v = this.values.get(key);
    return v !== undefined ? v : new NilValue();
  }

  set(key: string, value: TemplateValue): void {
    this.values.set(key, value);
  }

  add(key: string, value: TemplateValue): void {
    const cur = this.values.get(key);
    if (cur === undefined) {
      this.set(key, value);
      return;
    }
    if (cur instanceof AnyArrayValue) {
      const curArray = cur as AnyArrayValue;
      const mergedList: TemplateValue[] = [];
      for (let i = 0; i < curArray.value.length; i++) mergedList.push(curArray.value[i]!);
      if (value instanceof AnyArrayValue) {
        const valueArray = value as AnyArrayValue;
        for (let i = 0; i < valueArray.value.length; i++) mergedList.push(valueArray.value[i]!);
      } else {
        mergedList.push(value);
      }
      this.set(key, new AnyArrayValue(mergedList));
      return;
    }
    const pairList: TemplateValue[] = [];
    pairList.push(cur);
    pairList.push(value);
    this.set(key, new AnyArrayValue(pairList));
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  setInMap(mapName: string, key: string, value: TemplateValue): void {
    const cur = this.values.get(mapName);
    if (cur !== undefined) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.set(key, value);
        return;
      }
    }
    const map = new Map<string, TemplateValue>();
    map.set(key, value);
    this.values.set(mapName, new DictValue(map));
  }

  deleteInMap(mapName: string, key: string): void {
    const cur = this.values.get(mapName);
    if (cur !== undefined) {
      if (cur instanceof DictValue) {
        const dict = cur as DictValue;
        dict.value.delete(key);
      }
    }
  }
}

export class ScratchValue extends TemplateValue {
  value: ScratchStore;

  constructor(value: ScratchStore) {
    super();
    this.value = value;
  }
}
