import type { int } from "@tsonic/core/types.js";
import { Int32 } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { TemplateValue } from "./base.ts";

/**
 * Represents a version string with semver comparison semantics.
 * Used for hugo.Version to support comparisons like `lt hugo.Version "0.146.0"`.
 */
export class VersionStringValue extends TemplateValue {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  /**
   * Compare two version strings using semver-like comparison.
   * Returns -1 if a < b, 0 if a == b, 1 if a > b.
   */
  static compare(a: string, b: string): int {
    const aParts = VersionStringValue.parseVersion(a);
    const bParts = VersionStringValue.parseVersion(b);

    const aLen = aParts.Length;
    const bLen = bParts.Length;
    const maxLen = aLen > bLen ? aLen : bLen;

    for (let i = 0; i < maxLen; i++) {
      const av: int = i < aLen ? aParts[i]! : 0;
      const bv: int = i < bLen ? bParts[i]! : 0;
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  }

  private static parseVersion(v: string): int[] {
    // Remove common prefixes like "v" or "V"
    let cleaned = v;
    if (cleaned.StartsWith("v") || cleaned.StartsWith("V")) {
      cleaned = cleaned.Substring(1);
    }
    // Split by dots and convert to numbers
    const parts = cleaned.Split(".");
    const result = new List<int>();
    for (let i = 0; i < parts.Length; i++) {
      const part = parts[i]!;
      // Extract leading numeric portion (handles cases like "1-beta")
      const num = VersionStringValue.extractLeadingNumber(part);
      result.Add(num);
    }
    return result.ToArray();
  }

  private static extractLeadingNumber(s: string): int {
    let numStr = "";
    for (let i = 0; i < s.Length; i++) {
      const ch = s.Substring(i, 1);
      // Check if ch is a digit (0-9) using compareTo for C# compatibility
      if (ch.CompareTo("0") >= 0 && ch.CompareTo("9") <= 0) {
        numStr = numStr + ch;
      } else {
        break;
      }
    }
    if (numStr === "") return 0;
    return Int32.Parse(numStr);
  }
}
