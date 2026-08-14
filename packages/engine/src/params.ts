import type { int32 } from "@tsonic/core/types.js";
import { parseInt32 } from "./utils/int32.js";

export class ParamKind {
  static String: int32 = 0;
  static Bool: int32 = 1;
  static Number: int32 = 2;
}

export class ParamValue {
  kind: int32;
  stringValue: string;
  boolValue: boolean;
  numberValue: int32;

  constructor(kind: int32, stringValue: string, boolValue: boolean, numberValue: int32) {
    this.kind = kind;
    this.stringValue = stringValue;
    this.boolValue = boolValue;
    this.numberValue = numberValue;
  }

  static string(value: string): ParamValue {
    return new ParamValue(ParamKind.String, value, false, 0);
  }

  static bool(value: boolean): ParamValue {
    return new ParamValue(ParamKind.Bool, "", value, 0);
  }

  static number(value: int32): ParamValue {
    return new ParamValue(ParamKind.Number, "", false, value);
  }

  static parseScalar(text: string): ParamValue {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "true") return ParamValue.bool(true);
    if (lower === "false") return ParamValue.bool(false);

    const parsed = parseInt32(trimmed);
    if (parsed !== undefined) {
      return ParamValue.number(parsed);
    }

    return ParamValue.string(trimmed);
  }
}
