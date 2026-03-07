import type { int } from "@tsonic/core/types.js";

export const toInt32 = (value: number): int | undefined => {
  if (
    Number.isInteger(value) &&
    value >= -2147483648 &&
    value <= 2147483647
  ) {
    return value as int;
  }
  return undefined;
};

export const parseInt32 = (value: string): int | undefined => {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  return toInt32(Number.parseInt(trimmed, 10));
};
