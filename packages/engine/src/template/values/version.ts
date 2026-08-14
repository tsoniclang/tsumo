import type { int32 } from "@tsonic/core/types.js";
import { Int32 } from "@tsonic/dotnet/System.js";
import { TemplateValue } from "./base.js";
import { compareText, substringCount, substringFrom } from "../../utils/strings.js";

/**
 * Represents a version string with semver comparison semantics.
 * Used for hugo.Version to support comparisons like `lt hugo.Version "0.146.0"`.
 */
export class VersionStringValue extends TemplateValue {
  value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  /**
   * Compare two version strings using semver-like comparison.
   * Returns -1 if a < b, 0 if a == b, 1 if a > b.
   */
  static compare(a: string, b: string): int32 {
    const aParts = VersionStringValue.parseVersion(a);
    const bParts = VersionStringValue.parseVersion(b);

    const aLen = aParts.length;
    const bLen = bParts.length;
    const maxLen = aLen > bLen ? aLen : bLen;

    for (let i = 0; i < maxLen; i++) {
      const av: int32 = i < aLen ? aParts[i]! : 0;
      const bv: int32 = i < bLen ? bParts[i]! : 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  }

  static parseVersion(v: string): int32[] {
    // Remove common prefixes like "v" or "V"
    let cleaned = v;
    if (cleaned.startsWith("v") || cleaned.startsWith("V")) {
      cleaned = substringFrom(cleaned, 1);
    }
    // Split by dots and convert to numbers
    const parts = cleaned.split(".");
    const result: int32[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      // Extract leading numeric portion (handles cases like "1-beta")
      const num = VersionStringValue.extractLeadingNumber(part);
      result.push(num);
    }
    return result;
  }

  static extractLeadingNumber(s: string): int32 {
    let numStr = "";
    for (let i = 0; i < s.length; i++) {
      const ch = substringCount(s, i, 1);
      // Check if ch is a digit (0-9) using compareTo for C# compatibility
      if (compareText(ch, "0") >= 0 && compareText(ch, "9") <= 0) {
        numStr = numStr + ch;
      } else {
        break;
      }
    }
    if (numStr === "") return 0;
    return Int32.Parse(numStr);
  }
}
