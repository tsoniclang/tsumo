import { Regex } from "@tsonic/dotnet/System.Text.RegularExpressions.js";
import type { int32 } from "@tsonic/core/types.js";

export const findRegularExpressionMatches = (
  pattern: string,
  input: string,
  limit: int32,
): string[] => {
  const expression = new Regex(pattern);
  let match = expression.Match(input);
  const result: string[] = [];
  while (match.Success && (limit < 0 || result.length < limit)) {
    result.push(match.Value);
    match = match.NextMatch();
  }
  return result;
};

export const findRegularExpressionSubmatches = (
  pattern: string,
  input: string,
  limit: int32,
): string[][] => {
  const expression = new Regex(pattern);
  const groupNumbers = expression.GetGroupNumbers();
  let match = expression.Match(input);
  const result: string[][] = [];
  while (match.Success && (limit < 0 || result.length < limit)) {
    const row: string[] = [match.Value];
    for (let groupIndex = 1; groupIndex < groupNumbers.length; groupIndex++) {
      row.push(match.Result("${" + groupNumbers[groupIndex]! + "}"));
    }
    result.push(row);
    match = match.NextMatch();
  }
  return result;
};

export const replaceRegularExpression = (
  pattern: string,
  replacement: string,
  input: string,
  limit: int32,
): string => {
  const expression = new Regex(pattern);
  if (limit < 0) return expression.Replace(input, replacement);
  return expression.Replace(input, replacement, limit);
};
