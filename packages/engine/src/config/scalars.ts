import type { int32 } from "@tsonic/core/types.js";

import { createTsumoError } from "../diagnostics.js";
import { ParamKind, ParamValue } from "../params.js";
import { parseStructuredScalar, StructuredScalarFormat } from "../utils/structured-scalars.js";

const parseScalarText = (
  value: string,
  format: StructuredScalarFormat,
  sourcePath: string | undefined,
  line: int32,
): ParamValue => {
  return parseStructuredScalar(value, format, (message: string) =>
    createTsumoError("TSUMO_CONFIG_SYNTAX_INVALID", message, sourcePath, line, 1));
};

export const parseConfigParam = (
  value: string,
  format: StructuredScalarFormat,
  sourcePath: string | undefined,
  line: int32,
): ParamValue => parseScalarText(value, format, sourcePath, line);

export const parseConfigString = (
  field: string,
  value: string,
  format: StructuredScalarFormat,
  sourcePath: string | undefined,
  line: int32,
): string => {
  const parsed = parseScalarText(value, format, sourcePath, line);
  if (parsed.kind === ParamKind.String) return parsed.stringValue;
  throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Configuration field '${field}' requires a string`, sourcePath, line, 1);
};

export const parseConfigInt = (
  field: string,
  value: string,
  format: StructuredScalarFormat,
  sourcePath: string | undefined,
  line: int32,
): int32 => {
  const parsed = parseScalarText(value, format, sourcePath, line);
  if (parsed.kind === ParamKind.Number) return parsed.numberValue;
  throw createTsumoError("TSUMO_CONFIG_INVALID_FIELD", `Configuration field '${field}' requires a 32-bit integer`, sourcePath, line, 1);
};
