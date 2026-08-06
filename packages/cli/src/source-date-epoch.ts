import process from "node:process";
import { createTsumoError } from "@tsumo/engine/index.js";

export const readSourceDateEpoch = (): Date | undefined => {
  const raw = process.env["SOURCE_DATE_EPOCH"];
  if (raw === undefined) return undefined;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw createTsumoError("TSUMO_SOURCE_DATE_EPOCH_INVALID", "SOURCE_DATE_EPOCH must be a non-negative integer number of seconds");
  }

  const seconds = Number.parseFloat(value);
  if (!Number.isSafeInteger(seconds)) {
    throw createTsumoError("TSUMO_SOURCE_DATE_EPOCH_OUT_OF_RANGE", "SOURCE_DATE_EPOCH is outside the supported integer range");
  }

  const milliseconds = seconds * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds > 253_402_300_799_000) {
    throw createTsumoError("TSUMO_SOURCE_DATE_EPOCH_OUT_OF_RANGE", "SOURCE_DATE_EPOCH is outside the supported date range");
  }
  return new Date(milliseconds);
};
