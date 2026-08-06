import { DateTime } from "@tsonic/dotnet/System.js";
import { parseInt32 } from "../../utils/int32.js";
import { replaceText } from "../../utils/strings.js";

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
