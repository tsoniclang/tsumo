import { DateTime } from "@tsonic/dotnet/System.js";
import { parseInt32, toInt32 } from "../../utils/int32.js";
import { replaceText, substringCount, zeroPadInteger } from "../../utils/strings.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";

export const isNumberLiteral = (token: string): boolean => {
  if (token === "") return false;
  return parseInt32(token) !== undefined;
};

export const parseDateTime = (value: string): DateTime | undefined => {
  try {
    return DateTime.Parse(value);
  } catch (_err) {
    return undefined;
  }
};

const longWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const shortWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const longMonths = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const stripLeadingZero = (value: string): string => {
  return value.startsWith("0") ? value.slice(1) : value;
};

const weekdayIndex = (milliseconds: number): int32 => {
  let value = (Math.floor(milliseconds / 86400000) + 4) % 7;
  if (value < 0) value += 7;
  return value as int32;
};

export const addCalendarDate = (
  value: string,
  years: int32,
  months: int32,
  days: int32,
): string | undefined => {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) return undefined;
  const iso = new Date(milliseconds).toISOString();
  const sourceYear = parseInt32(substringCount(iso, 0, 4));
  const sourceMonth = parseInt32(substringCount(iso, 5, 2));
  const sourceDay = parseInt32(substringCount(iso, 8, 2));
  const hour = parseInt32(substringCount(iso, 11, 2));
  const minute = parseInt32(substringCount(iso, 14, 2));
  const second = parseInt32(substringCount(iso, 17, 2));
  const millisecond = parseInt32(substringCount(iso, 20, 3));
  if (
    sourceYear === undefined || sourceMonth === undefined || sourceDay === undefined ||
    hour === undefined || minute === undefined || second === undefined || millisecond === undefined
  ) return undefined;

  const sourceYearValue: number = sourceYear;
  const sourceMonthValue: number = sourceMonth;
  const yearsValue: number = years;
  const monthsValue: number = months;
  const totalMonths: number = sourceYearValue * 12 + sourceMonthValue - 1 + yearsValue * 12 + monthsValue;
  const targetYearValue: number = Math.floor(totalMonths / 12);
  if (targetYearValue < 1 || targetYearValue > 9999) return undefined;
  const targetYear = toInt32(targetYearValue);
  const targetMonth = toInt32(totalMonths - targetYearValue * 12);
  if (targetYear === undefined || targetMonth === undefined) return undefined;
  const yearText = zeroPadInteger(targetYear, 4);
  const monthText = zeroPadInteger(targetMonth + 1, 2);
  const hourText = zeroPadInteger(hour, 2);
  const minuteText = zeroPadInteger(minute, 2);
  const secondText = zeroPadInteger(second, 2);
  const millisecondText = zeroPadInteger(millisecond, 3);
  const monthStartText = yearText + "-" + monthText + "-01T" + hourText + ":" + minuteText + ":" +
    secondText + "." + millisecondText + "Z";
  const monthStart = Date.parse(monthStartText);
  if (Number.isNaN(monthStart)) return undefined;
  const sourceDayValue: number = sourceDay;
  const daysValue: number = days;
  const dayOffset: number = sourceDayValue - 1 + daysValue;
  const result = monthStart + dayOffset * 86400000;
  if (!Number.isFinite(result) || Math.abs(result) > 8640000000000000) return undefined;
  return new Date(result).toISOString();
};

export const isDateAfter = (left: string, right: string): boolean | undefined => {
  const leftMilliseconds = Date.parse(left);
  const rightMilliseconds = Date.parse(right);
  if (Number.isNaN(leftMilliseconds) || Number.isNaN(rightMilliseconds)) return undefined;
  return leftMilliseconds > rightMilliseconds;
};

export const formatDateTime = (value: string, layout: string): string | undefined => {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) return undefined;

  const iso = new Date(milliseconds).toISOString();
  const year = substringCount(iso, 0, 4);
  const month = substringCount(iso, 5, 2);
  const day = substringCount(iso, 8, 2);
  const hour24 = substringCount(iso, 11, 2);
  const minute = substringCount(iso, 14, 2);
  const second = substringCount(iso, 17, 2);
  const monthIndex: int32 = (parseInt32(month) ?? 1) - 1;
  const hourValue = parseInt32(hour24) ?? 0;
  const hour12Value = hourValue % 12 === 0 ? 12 : hourValue % 12;
  const hour12 = hour12Value < 10 ? `0${hour12Value}` : `${hour12Value}`;
  const weekday: int32 = weekdayIndex(milliseconds);
  const output = new StringBuilder();

  let index = 0;
  while (index < layout.length) {
    const remaining = layout.slice(index);
    if (remaining.startsWith("Monday")) {
      output.Append(longWeekdays[weekday]!);
      index += 6;
    } else if (remaining.startsWith("January")) {
      output.Append(longMonths[monthIndex]!);
      index += 7;
    } else if (remaining.startsWith("2006")) {
      output.Append(year);
      index += 4;
    } else if (remaining.startsWith("Mon")) {
      output.Append(shortWeekdays[weekday]!);
      index += 3;
    } else if (remaining.startsWith("Jan")) {
      output.Append(shortMonths[monthIndex]!);
      index += 3;
    } else if (remaining.startsWith("PM")) {
      output.Append(hourValue < 12 ? "AM" : "PM");
      index += 2;
    } else if (remaining.startsWith("pm")) {
      output.Append(hourValue < 12 ? "am" : "pm");
      index += 2;
    } else if (remaining.startsWith("06")) {
      output.Append(year.slice(2));
      index += 2;
    } else if (remaining.startsWith("01")) {
      output.Append(month);
      index += 2;
    } else if (remaining.startsWith("02")) {
      output.Append(day);
      index += 2;
    } else if (remaining.startsWith("15")) {
      output.Append(hour24);
      index += 2;
    } else if (remaining.startsWith("03")) {
      output.Append(hour12);
      index += 2;
    } else if (remaining.startsWith("04")) {
      output.Append(minute);
      index += 2;
    } else if (remaining.startsWith("05")) {
      output.Append(second);
      index += 2;
    } else if (remaining.startsWith("1")) {
      output.Append(stripLeadingZero(month));
      index += 1;
    } else if (remaining.startsWith("2")) {
      output.Append(stripLeadingZero(day));
      index += 1;
    } else if (remaining.startsWith("3")) {
      output.Append(`${hour12Value}`);
      index += 1;
    } else {
      output.Append(substringCount(layout, index, 1));
      index += 1;
    }
  }

  return output.ToString();
};

export const convertGoDateLayoutToDotNet = (layout: string): string => {
  // Best-effort mapping for common Hugo layouts.
  let f = layout;
  f = replaceText(f, "Monday", "dddd");
  f = replaceText(f, "Mon", "ddd");
  f = replaceText(f, "January", "MMMM");
  f = replaceText(f, "Jan", "MMM");
  f = replaceText(f, "2006", "yyyy");
  f = replaceText(f, "06", "yy");
  f = replaceText(f, "02", "dd");
  f = replaceText(f, "2", "d");
  f = replaceText(f, "01", "MM");
  f = replaceText(f, "1", "M");
  f = replaceText(f, "15", "HH");
  f = replaceText(f, "03", "hh");
  f = replaceText(f, "3", "h");
  f = replaceText(f, "04", "mm");
  f = replaceText(f, "05", "ss");
  f = replaceText(f, "PM", "tt");
  return f;
};


/**
 * Dispatch a method call on a receiver value.
 * This handles method calls like `(resources.ByType "image").GetMatch "foo*"`
 * where we have a receiver value and a method name with arguments.
 */
