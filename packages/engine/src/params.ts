import { Int32 } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/core/types.js";

export class ParamKind {
  static readonly String: int = 0;
  static readonly Bool: int = 1;
  static readonly Number: int = 2;
}

export class ParamValue {
  readonly kind: int;
  readonly stringValue: string;
  readonly boolValue: boolean;
  readonly numberValue: int;

  private constructor(kind: int, stringValue: string, boolValue: boolean, numberValue: int) {
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

  static number(value: int): ParamValue {
    return new ParamValue(ParamKind.Number, "", false, value);
  }

  static parseScalar(text: string): ParamValue {
    const trimmed = text.trim();
    const lower = trimmed.toLowerInvariant();

    if (lower === "true") return ParamValue.bool(true);
    if (lower === "false") return ParamValue.bool(false);

    let parsed: int = 0;
    if (Int32.tryParse(trimmed, parsed)) return ParamValue.number(parsed);

    return ParamValue.string(trimmed);
  }
}
