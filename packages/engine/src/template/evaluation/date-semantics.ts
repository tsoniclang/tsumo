import { createTsumoError } from "../../diagnostics.js";
import { parseInt32 } from "../../utils/int32.js";
import { toPlainString } from "../runtime-helpers.js";
import { BoolValue, DateValue, StringValue, TemplateValue } from "../values.js";
import { addCalendarDate, formatDateTime, isDateAfter } from "./scalar-semantics.js";

export function callDateMethod(
  receiver: TemplateValue,
  method: string,
  args: TemplateValue[],
): TemplateValue | undefined {
  if (!(receiver instanceof DateValue)) return undefined;
  if (method === "format") {
    if (args.length !== 1) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_ARGUMENTS_INVALID", "Date.Format requires one layout argument");
    }
    return new StringValue(formatDateTime(receiver.value, toPlainString(args[0]!)) ?? "");
  }
  if (method === "adddate") {
    if (args.length !== 3) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_ARGUMENTS_INVALID", "Date.AddDate requires year, month, and day offsets");
    }
    const years = parseInt32(toPlainString(args[0]!));
    const months = parseInt32(toPlainString(args[1]!));
    const days = parseInt32(toPlainString(args[2]!));
    if (years === undefined || months === undefined || days === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_ARGUMENTS_INVALID", "Date.AddDate offsets must be 32-bit integers");
    }
    const result = addCalendarDate(receiver.value, years, months, days);
    if (result === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_INVALID", `Date.AddDate cannot operate on '${receiver.value}'`);
    }
    return new DateValue(result);
  }
  if (method === "after") {
    const other = args.length === 1 ? args[0] : undefined;
    if (!(other instanceof DateValue)) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_ARGUMENTS_INVALID", "Date.After requires one date argument");
    }
    const result = isDateAfter(receiver.value, other.value);
    if (result === undefined) {
      throw createTsumoError("TSUMO_TEMPLATE_DATE_INVALID", "Date.After requires two valid dates");
    }
    return new BoolValue(result);
  }
  return undefined;
}
