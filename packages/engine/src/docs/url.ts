import type { int32 } from "@tsonic/core/types.js";
import { substringCount, substringFrom } from "../utils/strings.js";

export class UrlSuffixSplit {
  path: string;
  suffix: string;

  constructor(path: string, suffix: string) {
    this.path = path;
    this.suffix = suffix;
  }
}

export const splitUrlSuffix = (url: string): UrlSuffixSplit => {
  const q: int32 = url.indexOf("?");
  const h: int32 = url.indexOf("#");
  let cut: int32 = -1;
  if (q >= 0 && h >= 0) cut = q < h ? q : h;
  else if (q >= 0) cut = q;
  else if (h >= 0) cut = h;

  if (cut < 0) return new UrlSuffixSplit(url, "");
  return new UrlSuffixSplit(substringCount(url, 0, cut), substringFrom(url, cut));
};
