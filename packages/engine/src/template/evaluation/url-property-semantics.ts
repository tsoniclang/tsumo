import { Uri } from "@tsonic/dotnet/System.js";

import { substringCount, substringFrom } from "../../utils/strings.js";
import { UrlParts } from "../values.js";

export const splitUrlParts = (uri: Uri): UrlParts => {
  let rawQuery = "";
  let fragment = "";
  if (uri.IsAbsoluteUri) {
    rawQuery = uri.Query.startsWith("?") ? substringFrom(uri.Query, 1) : uri.Query;
    fragment = uri.Fragment.startsWith("#") ? substringFrom(uri.Fragment, 1) : uri.Fragment;
    return new UrlParts(uri.AbsolutePath, rawQuery, fragment);
  }

  const raw = uri.OriginalString;
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? substringCount(raw, 0, hashIndex) : raw;
  fragment = hashIndex >= 0 ? substringFrom(raw, hashIndex + 1) : "";

  const queryIndex = beforeHash.indexOf("?");
  const path = queryIndex >= 0 ? substringCount(beforeHash, 0, queryIndex) : beforeHash;
  rawQuery = queryIndex >= 0 ? substringFrom(beforeHash, queryIndex + 1) : "";
  return new UrlParts(path, rawQuery, fragment);
};
