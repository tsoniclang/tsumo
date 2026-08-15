import { ParamKind, ParamValue } from "../../params.js";
import { BoolValue, NumberValue, StringValue, TemplateValue } from "../values.js";

export const paramToTemplateValue = (value: ParamValue): TemplateValue => {
  if (value.kind === ParamKind.Bool) return new BoolValue(value.boolValue);
  if (value.kind === ParamKind.Number) return new NumberValue(value.numberValue);
  return new StringValue(value.stringValue);
};

export const findParam = (values: Map<string, ParamValue>, name: string): ParamValue | undefined => {
  const exact = values.get(name);
  if (exact !== undefined) return exact;
  const normalized = name.toLowerCase();
  for (const key of values.keys()) {
    if (key.toLowerCase() === normalized) return values.get(key);
  }
  return undefined;
};
