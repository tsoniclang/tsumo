import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { Uri } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";
import {
  findRegularExpressionMatches,
  findRegularExpressionSubmatches,
  replaceRegularExpression,
} from "../../utils/regular-expressions.js";
import {
  codePointLength,
  compareText,
  replaceText,
  substringCodePoints,
  substringCount,
  substringFrom,
  trimCodePoints,
  trimEndCodePoints,
  trimStartCodePoints,
  trimStartChar,
  trimUnicodeSpace,
} from "../../utils/strings.js";
import { ensureTrailingSlash, humanizeSlug, slugify } from "../../utils/text.js";
import { parseInt32 } from "../../utils/int32.js";
import { renderMarkdown } from "../../markdown.js";
import {
  AnyArrayValue, BoolValue, DateValue, DictValue, DocsMountArrayValue, HtmlValue,
  NavArrayValue, NilValue, NumberValue, PageArrayValue, PageValue, ResourceValue, ScratchStore, ScratchValue,
  SitesArrayValue, StringArrayValue, StringValue, TemplateValue, UrlQueryValue, UrlValue, VersionStringValue,
} from "../values.js";
import { HtmlString } from "../../utils/html.js";
import { createTsumoError } from "../../diagnostics.js";
import { convertGoDateLayoutToDotNet, parseDateTime } from "../evaluation/scalar-semantics.js";
import { parseUrl, toJson, trimEndCharacter, trimSlashes, trimStartCharacter } from "../evaluation/serialization.js";
import { isDefaultSet, isTemplateMap, isTemplateSlice, isTruthy, nil, toNumber, toPlainString } from "../runtime-helpers.js";
import { TemplateFunctionContext } from "./function-context.js";
import { anchorizeText, emojifyText } from "./text-compatibility.js";

const requireSubstringInteger = (value: TemplateValue, name: string): int32 => {
  const result = parseInt32(toPlainString(value));
  if (result === undefined) {
    throw createTsumoError("TSUMO_TEMPLATE_SUBSTRING_ARGUMENT_INVALID", `substr ${name} must be a 32-bit integer`);
  }
  return result;
};

const templateValueTypeName = (value: TemplateValue): string => {
  if (value instanceof NilValue) return "<nil>";
  if (value instanceof BoolValue) return "bool";
  if (value instanceof NumberValue) return "int";
  if (value instanceof StringValue) return "string";
  if (value instanceof HtmlValue) return "template.HTML";
  if (value instanceof DateValue) return "time.Time";
  if (value instanceof StringArrayValue) return "[]string";
  if (value instanceof AnyArrayValue || value instanceof PageArrayValue) return "[]interface {}";
  if (value instanceof DictValue) return "map[string]interface {}";
  if (value instanceof PageValue) return "*hugolib.pageState";
  if (value instanceof ResourceValue) return "resource.Resource";
  if (value instanceof UrlValue) return "*url.URL";
  if (value instanceof UrlQueryValue) return "url.Values";
  return "interface {}";
};

const formatTemplateValue = (value: TemplateValue, verb: string): string => {
  if (verb === "T") return templateValueTypeName(value);
  if (verb === "q") return toJson(new StringValue(toPlainString(value)));
  if (verb === "#v") return toJson(value);
  return toPlainString(value);
};

export const callScalarFunction = (
  name: string,
  args: TemplateValue[],
  context: TemplateFunctionContext,
): TemplateValue | undefined => {
  const scope = context.scope;
  if (name === "reflect.ismap" && args.length >= 1) return new BoolValue(isTemplateMap(args[0]!));
  if (name === "reflect.isslice" && args.length >= 1) return new BoolValue(isTemplateSlice(args[0]!));
  if (name === "add" && args.length >= 2) {
    let sum: int32 = 0;
    for (let i = 0; i < args.length; i++) {
      const v = args[i]!;
      const s = toPlainString(v);
      sum += parseInt32(s) ?? 0;
    }
    return new NumberValue(sum);
  }

  if (name === "sub" && args.length >= 2) {
    const a = toNumber(args[0]!);
    const b = toNumber(args[1]!);
    return new NumberValue(a - b);
  }

  if (name === "mul" && args.length >= 2) {
    const a = toNumber(args[0]!);
    const b = toNumber(args[1]!);
    return new NumberValue(a * b);
  }

  if (name === "div" && args.length >= 2) {
    const a = toNumber(args[0]!);
    const b = toNumber(args[1]!);
    if (b === 0) throw createTsumoError("TSUMO_TEMPLATE_DIVIDE_BY_ZERO", "Template division by zero is not valid");
    return new NumberValue(a / b);
  }

  if (name === "mod" && args.length >= 2) {
    const a = toNumber(args[0]!);
    const b = toNumber(args[1]!);
    if (b === 0) throw createTsumoError("TSUMO_TEMPLATE_MODULO_BY_ZERO", "Template modulo by zero is not valid");
    return new NumberValue(a % b);
  }

  if (name === "ceil" && args.length >= 1 && args[0] instanceof NumberValue) {
    return args[0]!;
  }

  if ((name === "min" || name === "max") && args.length >= 1) {
    let selected = toNumber(args[0]!);
    for (let index = 1; index < args.length; index++) {
      const candidate = toNumber(args[index]!);
      if (name === "min" ? candidate < selected : candidate > selected) selected = candidate;
    }
    return new NumberValue(selected);
  }

  if (name === "round" && args.length >= 1 && args[0] instanceof NumberValue) {
    return args[0]!;
  }

  if (name === "int" && args.length === 1) {
    const value = args[0]!;
    if (value instanceof NumberValue) return value;
    const parsed = parseInt32(toPlainString(value));
    if (parsed === undefined) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_INTEGER_CONVERSION_INVALID",
        `Template value '${toPlainString(value)}' is not a 32-bit integer`,
      );
    }
    return new NumberValue(parsed);
  }

  if (name === "string" && args.length === 1) return new StringValue(toPlainString(args[0]!));

  if ((name === "time" || name === "time.astime") && args.length === 1) {
    const value = args[0]!;
    if (value instanceof DateValue) return value;
    const text = toPlainString(value);
    if (Number.isNaN(Date.parse(text))) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_TIME_INVALID",
        `Template value '${text}' is not a valid date or time`,
      );
    }
    return new DateValue(text);
  }

  if (name === "newscratch") {
    return new ScratchValue(new ScratchStore());
  }

  if (name === "encoding.jsonify" || name === "jsonify") {
    const v = args.length >= 1 ? args[0]! : nil;
    return new StringValue(toJson(v));
  }

  if (name === "crypto.sha1" && args.length >= 1) {
    const bytes = Buffer.from(toPlainString(args[0]!), "utf8");
    return new StringValue(createHash("sha1").update(bytes).digest("hex"));
  }

  if (name === "md5" && args.length >= 1) {
    const bytes = Buffer.from(toPlainString(args[0]!), "utf8");
    return new StringValue(createHash("md5").update(bytes).digest("hex"));
  }

  if (name === "urls.parse" && args.length >= 1) {
    const s = toPlainString(args[0]!);
    return new UrlValue(parseUrl(s));
  }

  if (name === "urls.joinpath" && args.length >= 1) {
    const parts: string[] = [];
    for (let i = 0; i < args.length; i++) parts.push(toPlainString(args[i]!));
    const arr = parts;
    let out = "";
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i]!;
      out = out === "" ? trimSlashes(p) : trimEndCharacter(out, "/") + "/" + trimStartCharacter(p, "/");
    }
    return new StringValue(out);
  }

  if (name === "strings.contains" && args.length >= 2) {
    const s = toPlainString(args[0]!);
    const sub = toPlainString(args[1]!);
    return new BoolValue(s.includes(sub));
  }

  if (name === "strings.repeat" && args.length >= 2) {
    const count = toNumber(args[0]!);
    if (count < 0) {
      throw createTsumoError("TSUMO_TEMPLATE_STRING_REPEAT_INVALID", "strings.Repeat requires a non-negative repetition count");
    }
    return new StringValue(toPlainString(args[1]!).repeat(count));
  }

  if (name === "strings.hasprefix" && args.length >= 2) {
    const s = toPlainString(args[0]!);
    const prefix = toPlainString(args[1]!);
    return new BoolValue(s.startsWith(prefix));
  }

  if (name === "strings.hassuffix" && args.length >= 2) {
    const s = toPlainString(args[0]!);
    const suffix = toPlainString(args[1]!);
    return new BoolValue(s.endsWith(suffix));
  }

  if (name === "strings.trimprefix" && args.length >= 2) {
    const prefix = toPlainString(args[0]!);
    const s = toPlainString(args[1]!);
    return new StringValue(s.startsWith(prefix) ? substringFrom(s, prefix.length) : s);
  }

  if (name === "strings.trimsuffix" && args.length >= 2) {
    const suffix = toPlainString(args[0]!);
    const s = toPlainString(args[1]!);
    return new StringValue(s.endsWith(suffix) ? substringCount(s, 0, s.length - suffix.length) : s);
  }

  if (name === "strings.trim" && args.length >= 2) {
    const value = toPlainString(args[0]!);
    const cutset = toPlainString(args[1]!);
    return new StringValue(trimCodePoints(value, cutset));
  }

  if (name === "strings.trimleft" && args.length >= 2) {
    return new StringValue(trimStartCodePoints(toPlainString(args[1]!), toPlainString(args[0]!)));
  }

  if (name === "strings.trimright" && args.length >= 2) {
    return new StringValue(trimEndCodePoints(toPlainString(args[1]!), toPlainString(args[0]!)));
  }

  if (name === "strings.trimspace" && args.length >= 1) {
    return new StringValue(trimUnicodeSpace(toPlainString(args[0]!)));
  }

  if (name === "substr" && (args.length === 2 || args.length === 3)) {
    const source = toPlainString(args[0]!);
    const sourceLength = codePointLength(source);
    if (sourceLength === 0) return new StringValue("");
    let start = requireSubstringInteger(args[1]!, "start");
    if (start < 0) start += sourceLength;
    if (start < 0) start = 0;
    if (start >= sourceLength) return new StringValue("");

    let end: int32 = sourceLength;
    if (args.length === 3) {
      const length = requireSubstringInteger(args[2]!, "length");
      if (length === 0) return new StringValue("");
      end = length < 0 ? sourceLength + length : start + length;
    }
    if (start >= end || end < 0) return new StringValue("");
    if (end > sourceLength) end = sourceLength;
    return new StringValue(substringCodePoints(source, start, end - start));
  }


  if (name === "urlize" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(slugify(toPlainString(v)));
  }

  if (name === "anchorize" && args.length >= 1) {
    return new StringValue(anchorizeText(toPlainString(args[0]!)));
  }

  if (name === "emojify" && args.length >= 1) {
    return new HtmlValue(new HtmlString(emojifyText(toPlainString(args[0]!))));
  }

  if (name === "humanize" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(humanizeSlug(toPlainString(v)));
  }

  if (name === "lower" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(toPlainString(v).toLowerCase());
  }

  if (name === "upper" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(toPlainString(v).toUpperCase());
  }

  if (name === "trim" && args.length >= 1) {
    const v = args[0]!;
    return new StringValue(toPlainString(v).trim());
  }

  if (name === "chomp" && args.length >= 1) {
    let value = toPlainString(args[0]!);
    while (value.endsWith("\n") || value.endsWith("\r")) {
      value = substringCount(value, 0, value.length - 1);
    }
    return new StringValue(value);
  }

  if (name === "replace" && args.length >= 3) {
    const s = toPlainString(args[0]!);
    const oldStr = toPlainString(args[1]!);
    const newStr = toPlainString(args[2]!);
    return new StringValue(s.replaceAll(oldStr, newStr));
  }

  if (name === "replacere" && args.length >= 3) {
    const pattern = toPlainString(args[0]!);
    const replacement = toPlainString(args[1]!);
    const s = toPlainString(args[2]!);
    const limit: int32 = args.length >= 4 ? toNumber(args[3]!) : -1;
    return new StringValue(replaceRegularExpression(pattern, replacement, s, limit));
  }

  if (name === "findre" && args.length >= 2) {
    const pattern = toPlainString(args[0]!);
    const input = toPlainString(args[1]!);
    const limit: int32 = args.length >= 3 ? toNumber(args[2]!) : -1;
    return new StringArrayValue(findRegularExpressionMatches(pattern, input, limit));
  }

  if (name === "findresubmatch" && args.length >= 2) {
    const pattern = toPlainString(args[0]!);
    const input = toPlainString(args[1]!);
    const limit: int32 = args.length >= 3 ? toNumber(args[2]!) : -1;
    const matches = findRegularExpressionSubmatches(pattern, input, limit);
    const result: TemplateValue[] = [];
    for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
      result.push(new StringArrayValue(matches[matchIndex]!));
    }
    return new AnyArrayValue(result);
  }

  if (name === "truncate" && args.length >= 2) {
    const length = toNumber(args[0]!);
    const s = toPlainString(args[1]!);
    const ellipsis = args.length >= 3 ? toPlainString(args[2]!) : "...";
    if (s.length <= length) return new StringValue(s);
    const truncLen: int32 = length - ellipsis.length;
    if (truncLen <= 0) return new StringValue(substringCount(ellipsis, 0, length));
    return new StringValue(substringCount(s, 0, truncLen) + ellipsis);
  }

  if (name === "markdownify" && args.length >= 1) {
    const s = toPlainString(args[0]!);
    const md = renderMarkdown(s);
    // Strip wrapping <p> tags for inline use
    let html = md.html.trim();
    if (html.startsWith("<p>") && html.endsWith("</p>")) {
      html = substringCount(html, 3, html.length - 4);
    }
    return new HtmlValue(new HtmlString(html));
  }

  if (name === "relurl" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    return new StringValue(s.startsWith("/") ? s : "/" + s);
  }

  if (name === "absurl" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    const rel = s.startsWith("/") ? substringFrom(s, 1) : s;
    return new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
  }

  if (name === "abslangurl" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    const lang = scope.site.Language.Lang;
    const langPrefix = scope.site.Languages.length > 1 ? lang + "/" : "";
    const rel = s.startsWith("/") ? substringFrom(s, 1) : s;
    return new StringValue(ensureTrailingSlash(scope.site.baseURL) + langPrefix + rel);
  }

  if (name === "rellangurl" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    const lang = scope.site.Language.Lang;
    const langPrefix = scope.site.Languages.length > 1 ? "/" + lang : "";
    const path = s.startsWith("/") ? s : "/" + s;
    return new StringValue(langPrefix + path);
  }

  if (name === "urlquery" && args.length >= 1) {
    const v = args[0]!;
    const s = toPlainString(v);
    return new StringValue(Uri.EscapeDataString(s));
  }

  if (name === "querify" && args.length >= 2) {
    return new StringValue(
      Uri.EscapeDataString(toPlainString(args[0]!)) + "=" + Uri.EscapeDataString(toPlainString(args[1]!)),
    );
  }

  if (name === "default" && args.length === 1) return args[0]!;

  if (name === "default" && args.length === 2) {
    const fallback = args[0]!;
    const v = args[1]!;
    return isDefaultSet(v) ? v : fallback;
  }

  if (name === "len" && args.length >= 1) {
    const v = args[0]!;
    if (v instanceof StringValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof HtmlValue) {
      const l: int32 = v.value.value.length;
      return new NumberValue(l);
    }
    if (v instanceof PageArrayValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof StringArrayValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof SitesArrayValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof DocsMountArrayValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof NavArrayValue) {
      const l: int32 = v.value.length;
      return new NumberValue(l);
    }
    if (v instanceof DictValue) {
      return new NumberValue(v.value.size);
    }
    if (v instanceof AnyArrayValue) {
      return new NumberValue(v.value.length);
    }
    return new NumberValue(0);
  }

  if (name === "dateformat" && args.length >= 2) {
    const layout = toPlainString(args[0]!);
    const s = toPlainString(args[1]!);
    const parsed = parseDateTime(s);
    if (parsed === undefined) return new StringValue("");
    const fmt = convertGoDateLayoutToDotNet(layout);
    return new StringValue(parsed.ToString(fmt));
  }

  if (name === "print" && args.length >= 1) {
    const sb = new StringBuilder();
    for (let i = 0; i < args.length; i++) sb.Append(toPlainString(args[i]!));
    return new StringValue(sb.ToString());
  }

  if (name === "printf" && args.length >= 1) {
    const fmt = toPlainString(args[0]!);
    const values: TemplateValue[] = [];
    for (let argumentIndex = 1; argumentIndex < args.length; argumentIndex++) values.push(args[argumentIndex]!);

    const sb = new StringBuilder();
    let pos = 0;
    let valueIndex = 0;
    while (pos < fmt.length) {
      const ch = substringCount(fmt, pos, 1);
      if (ch === "%" && pos + 1 < fmt.length) {
        const next = substringCount(fmt, pos + 1, 1);
        if (next === "%") {
          sb.Append("%");
          pos += 2;
          continue;
        }
        let verb = next;
        let width: int32 = 2;
        if (next === "#" && pos + 2 < fmt.length && substringCount(fmt, pos + 2, 1) === "v") {
          verb = "#v";
          width = 3;
        }
        if (verb === "s" || verb === "d" || verb === "t" || verb === "v" || verb === "q" || verb === "T" || verb === "#v") {
          if (valueIndex < values.length) sb.Append(formatTemplateValue(values[valueIndex]!, verb));
          valueIndex++;
          pos += width;
          continue;
        }
      }
      sb.Append(ch);
      pos++;
    }

    return new StringValue(sb.ToString());
  }

  if (args.length >= 2) {
    const isCompare = name === "eq" || name === "ne" || name === "lt" || name === "le" || name === "gt" || name === "ge";
    if (isCompare) {
      const a = args[0]!;
      const b = args[1]!;

      let cmp = 0;
      // Handle VersionStringValue comparisons using semver semantics
      if (a instanceof VersionStringValue || b instanceof VersionStringValue) {
        const av = toPlainString(a);
        const bv = toPlainString(b);
        cmp = VersionStringValue.compare(av, bv);
      } else if (a instanceof NumberValue) {
        if (b instanceof NumberValue) {
          const av = a.value;
          const bv = b.value;
          cmp = av < bv ? -1 : av > bv ? 1 : 0;
        } else {
          const av = toPlainString(a);
          const bv = toPlainString(b);
          cmp = compareText(av, bv);
        }
      } else {
        const av = toPlainString(a);
        const bv = toPlainString(b);
        cmp = compareText(av, bv);
      }

      if (name === "eq") return new BoolValue(cmp === 0);
      if (name === "ne") return new BoolValue(cmp !== 0);
      if (name === "lt") return new BoolValue(cmp < 0);
      if (name === "le") return new BoolValue(cmp <= 0);
      if (name === "gt") return new BoolValue(cmp > 0);
      return new BoolValue(cmp >= 0);
    }
  }

  if (name === "not" && args.length >= 1) {
    return new BoolValue(!isTruthy(args[0]!));
  }

  if (name === "and" && args.length >= 1) {
    let cur = args[0]!;
    for (let i = 0; i < args.length; i++) {
      cur = args[i]!;
      if (!isTruthy(cur)) return cur;
    }
    return cur;
  }

  if (name === "or" && args.length >= 1) {
    for (let i = 0; i < args.length; i++) {
      const cur = args[i]!;
      if (isTruthy(cur)) return cur;
    }
    return args[args.length - 1]!;
  }
  return undefined;
};
