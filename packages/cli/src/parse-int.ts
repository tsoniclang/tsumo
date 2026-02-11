import { Int32 } from "@tsonic/dotnet/System.js";
import type { int } from "@tsonic/core/types.js";

export const parseIntArg = (value: string): int | undefined => {
  let parsed: int = 0;
  const ok = Int32.TryParse(value, parsed);
  return ok ? parsed : undefined;
};

