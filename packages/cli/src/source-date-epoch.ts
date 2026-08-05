import process from "node:process";
import { Exception } from "@tsonic/dotnet/System.js";

export const readSourceDateEpoch = (): Date | undefined => {
  const raw = process.env["SOURCE_DATE_EPOCH"];
  if (raw === undefined) return undefined;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Exception("SOURCE_DATE_EPOCH must be a non-negative integer number of seconds");
  }

  const seconds = Number.parseFloat(value);
  if (!Number.isSafeInteger(seconds)) {
    throw new Exception("SOURCE_DATE_EPOCH is outside the supported integer range");
  }

  const buildTime = new Date(seconds * 1000);
  if (!Number.isFinite(buildTime.getTime())) {
    throw new Exception("SOURCE_DATE_EPOCH is outside the supported date range");
  }
  return buildTime;
};
