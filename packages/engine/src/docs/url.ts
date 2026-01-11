import type { int } from "@tsonic/core/types.js";

export class UrlSuffixSplit {
  readonly path: string;
  readonly suffix: string;

  constructor(path: string, suffix: string) {
    this.path = path;
    this.suffix = suffix;
  }
}

export const splitUrlSuffix = (url: string): UrlSuffixSplit => {
  const q: int = url.indexOf("?");
  const h: int = url.indexOf("#");
  let cut: int = -1;
  if (q >= 0 && h >= 0) cut = q < h ? q : h;
  else if (q >= 0) cut = q;
  else if (h >= 0) cut = h;

  if (cut < 0) return new UrlSuffixSplit(url, "");
  return new UrlSuffixSplit(url.substring(0, cut), url.substring(cut));
};

