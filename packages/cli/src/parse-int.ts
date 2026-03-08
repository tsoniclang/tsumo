import type { int } from "@tsonic/core/types.js";

export const parseIntArg = (value: string): int | undefined => {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (
    Number.isInteger(parsed) &&
    parsed >= -2147483648 &&
    parsed <= 2147483647
  ) {
    return parsed as int;
  }
  return undefined;
};
