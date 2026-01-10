import { DateTime, Exception, Int32 } from "@tsonic/dotnet/System.js";
import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int } from "@tsonic/core/types.js";
import { HtmlString, escapeHtml } from "./utils/html.ts";
import { indexOfTextFrom, replaceText } from "./utils/strings.ts";
import { ensureTrailingSlash, humanizeSlug, slugify } from "./utils/text.ts";
import { PageContext, SiteContext } from "./models.ts";

export class TemplateValue {}

class NilValue extends TemplateValue {}

class StringValue extends TemplateValue {
  readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }
}

class BoolValue extends TemplateValue {
  readonly value: boolean;

  constructor(value: boolean) {
    super();
    this.value = value;
  }
}

class NumberValue extends TemplateValue {
  readonly value: int;

  constructor(value: int) {
    super();
    this.value = value;
  }
}

class HtmlValue extends TemplateValue {
  readonly value: HtmlString;

  constructor(value: HtmlString) {
    super();
    this.value = value;
  }
}

class PageValue extends TemplateValue {
  readonly value: PageContext;

  constructor(value: PageContext) {
    super();
    this.value = value;
  }
}

class SiteValue extends TemplateValue {
  readonly value: SiteContext;

  constructor(value: SiteContext) {
    super();
    this.value = value;
  }
}

class PageArrayValue extends TemplateValue {
  readonly value: PageContext[];

  constructor(value: PageContext[]) {
    super();
    this.value = value;
  }
}

class StringArrayValue extends TemplateValue {
  readonly value: string[];

  constructor(value: string[]) {
    super();
    this.value = value;
  }
}

class DictValue extends TemplateValue {
  readonly value: Dictionary<string, string>;

  constructor(value: Dictionary<string, string>) {
    super();
    this.value = value;
  }
}

export class RenderScope {
  readonly root: PageContext;
  readonly dot: TemplateValue;
  readonly site: SiteContext;

  constructor(root: PageContext, dot: TemplateValue, site: SiteContext) {
    this.root = root;
    this.dot = dot;
    this.site = site;
  }
}

export class TemplateNode {
  render(_sb: StringBuilder, _scope: RenderScope, _env: TemplateEnvironment, _overrides: Dictionary<string, TemplateNode[]>): void {
    throw new Exception("TemplateNode.render is not implemented");
  }
}

export class TextNode extends TemplateNode {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  override render(sb: StringBuilder, _scope: RenderScope, _env: TemplateEnvironment, _overrides: Dictionary<string, TemplateNode[]>): void {
    sb.append(this.text);
  }
}

export class OutputNode extends TemplateNode {
  readonly pipeline: Pipeline;
  readonly escape: boolean;

  constructor(pipeline: Pipeline, escape: boolean) {
    super();
    this.pipeline = pipeline;
    this.escape = escape;
  }

  override render(sb: StringBuilder, scope: RenderScope, _env: TemplateEnvironment, _overrides: Dictionary<string, TemplateNode[]>): void {
    const value = this.pipeline.eval(scope);
    sb.append(TemplateRuntime.stringify(value, this.escape));
  }
}

export class PartialNode extends TemplateNode {
  readonly name: string;
  readonly context: Pipeline;

  constructor(name: string, context: Pipeline) {
    super();
    this.name = name;
    this.context = context;
  }

  override render(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    const ctx = this.context.eval(scope);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    const tpl = env.getTemplate(`partials/${this.name}`);
    if (tpl === undefined) return;
    const nextScope = new RenderScope(scope.root, dot, scope.site);
    tpl.renderInto(sb, nextScope, env, overrides);
  }
}

export class IfNode extends TemplateNode {
  readonly condition: Pipeline;
  readonly thenNodes: TemplateNode[];
  readonly elseNodes: TemplateNode[];

  constructor(condition: Pipeline, thenNodes: TemplateNode[], elseNodes: TemplateNode[]) {
    super();
    this.condition = condition;
    this.thenNodes = thenNodes;
    this.elseNodes = elseNodes;
  }

  override render(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    const value = this.condition.eval(scope);
    if (TemplateRuntime.isTruthy(value)) {
      for (let i = 0; i < this.thenNodes.length; i++) this.thenNodes[i]!.render(sb, scope, env, overrides);
      return;
    }
    for (let i = 0; i < this.elseNodes.length; i++) this.elseNodes[i]!.render(sb, scope, env, overrides);
  }
}

export class RangeNode extends TemplateNode {
  readonly expr: Pipeline;
  readonly body: TemplateNode[];
  readonly elseBody: TemplateNode[];

  constructor(expr: Pipeline, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.body = body;
    this.elseBody = elseBody;
  }

  override render(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    const value = this.expr.eval(scope);

    if (value instanceof PageArrayValue) {
      const pageArray = value as PageArrayValue;
      const pages = pageArray.value;
      if (pages.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides);
        return;
      }
      for (let i = 0; i < pages.length; i++) {
        const nextScope = new RenderScope(scope.root, new PageValue(pages[i]!), scope.site);
        for (let j = 0; j < this.body.length; j++) this.body[j]!.render(sb, nextScope, env, overrides);
      }
      return;
    }

    if (value instanceof StringArrayValue) {
      const stringArray = value as StringArrayValue;
      const items = stringArray.value;
      if (items.length === 0) {
        for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides);
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const nextScope = new RenderScope(scope.root, new StringValue(items[i]!), scope.site);
        for (let j = 0; j < this.body.length; j++) this.body[j]!.render(sb, nextScope, env, overrides);
      }
      return;
    }

    for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides);
  }
}

export class WithNode extends TemplateNode {
  readonly expr: Pipeline;
  readonly body: TemplateNode[];
  readonly elseBody: TemplateNode[];

  constructor(expr: Pipeline, body: TemplateNode[], elseBody: TemplateNode[]) {
    super();
    this.expr = expr;
    this.body = body;
    this.elseBody = elseBody;
  }

  override render(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    const value = this.expr.eval(scope);
    if (TemplateRuntime.isTruthy(value)) {
      const nextScope = new RenderScope(scope.root, value, scope.site);
      for (let i = 0; i < this.body.length; i++) this.body[i]!.render(sb, nextScope, env, overrides);
      return;
    }
    for (let i = 0; i < this.elseBody.length; i++) this.elseBody[i]!.render(sb, scope, env, overrides);
  }
}

export class BlockNode extends TemplateNode {
  readonly name: string;
  readonly context: Pipeline;
  readonly fallback: TemplateNode[];

  constructor(name: string, context: Pipeline, fallback: TemplateNode[]) {
    super();
    this.name = name;
    this.context = context;
    this.fallback = fallback;
  }

  override render(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    const overrideNodes: TemplateNode[] = [];
    const hasOverride = overrides.tryGetValue(this.name, overrideNodes);
    const ctx = this.context.eval(scope);
    const dot = ctx instanceof NilValue ? scope.dot : ctx;
    const nextScope = new RenderScope(scope.root, dot, scope.site);

    if (hasOverride) {
      for (let i = 0; i < overrideNodes.length; i++) overrideNodes[i]!.render(sb, nextScope, env, overrides);
      return;
    }

    for (let i = 0; i < this.fallback.length; i++) this.fallback[i]!.render(sb, nextScope, env, overrides);
  }
}

export class Template {
  readonly nodes: TemplateNode[];
  readonly defines: Dictionary<string, TemplateNode[]>;

  constructor(nodes: TemplateNode[], defines: Dictionary<string, TemplateNode[]>) {
    this.nodes = nodes;
    this.defines = defines;
  }

  render(root: PageContext, env: TemplateEnvironment, overrides?: Dictionary<string, TemplateNode[]>): string {
    const sb = new StringBuilder();
    const scope = new RenderScope(root, new PageValue(root), root.site);
    const defs = overrides ?? new Dictionary<string, TemplateNode[]>();
    this.renderInto(sb, scope, env, defs);
    return sb.toString();
  }

  renderInto(sb: StringBuilder, scope: RenderScope, env: TemplateEnvironment, overrides: Dictionary<string, TemplateNode[]>): void {
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i]!.render(sb, scope, env, overrides);
    }
  }
}

export class TemplateEnvironment {
  getTemplate(_relPath: string): Template | undefined {
    throw new Exception("TemplateEnvironment.getTemplate is not implemented");
  }
}

export class Pipeline {
  readonly stages: string[][];

  constructor(stages: string[][]) {
    this.stages = stages;
  }

  eval(scope: RenderScope): TemplateValue {
    if (this.stages.length === 0) return TemplateRuntime.nil;

    let value = TemplateRuntime.evalStage(this.stages[0]!, scope, undefined);
    for (let i = 1; i < this.stages.length; i++) {
      value = TemplateRuntime.evalStage(this.stages[i]!, scope, value);
    }
    return value;
  }
}

class TemplateRuntime {
  static readonly nil: TemplateValue = new NilValue();

  static isTruthy(value: TemplateValue): boolean {
    if (value instanceof NilValue) return false;

    if (value instanceof BoolValue) {
      const boolValue = value as BoolValue;
      return boolValue.value;
    }

    if (value instanceof NumberValue) {
      const numberValue = value as NumberValue;
      return numberValue.value !== 0;
    }

    if (value instanceof StringValue) {
      const stringValue = value as StringValue;
      return stringValue.value !== "";
    }

    if (value instanceof HtmlValue) {
      const htmlValue = value as HtmlValue;
      return htmlValue.value.value !== "";
    }

    if (value instanceof DictValue) {
      const dictValue = value as DictValue;
      return dictValue.value.count > 0;
    }

    if (value instanceof PageArrayValue) {
      const pageArrayValue = value as PageArrayValue;
      return pageArrayValue.value.length > 0;
    }

    if (value instanceof StringArrayValue) {
      const stringArrayValue = value as StringArrayValue;
      return stringArrayValue.value.length > 0;
    }

    return true;
  }

  static toPlainString(value: TemplateValue): string {
    if (value instanceof StringValue) {
      const stringValue = value as StringValue;
      return stringValue.value;
    }

    if (value instanceof HtmlValue) {
      const htmlValue = value as HtmlValue;
      return htmlValue.value.value;
    }

    if (value instanceof BoolValue) {
      const boolValue = value as BoolValue;
      return boolValue.value ? "true" : "false";
    }

    if (value instanceof NumberValue) {
      const numberValue = value as NumberValue;
      return numberValue.value.toString();
    }

    return "";
  }

  static stringify(value: TemplateValue, escape: boolean): string {
    if (value instanceof NilValue) return "";
    if (value instanceof HtmlValue) {
      const htmlValue = value as HtmlValue;
      return htmlValue.value.value;
    }
    if (value instanceof StringValue) {
      const stringValue = value as StringValue;
      const s = stringValue.value;
      return escape ? escapeHtml(s) : s;
    }
    if (value instanceof BoolValue) {
      const boolValue = value as BoolValue;
      return boolValue.value ? "true" : "false";
    }
    if (value instanceof NumberValue) {
      const numberValue = value as NumberValue;
      return numberValue.value.toString();
    }
    return "";
  }

  static parseStringLiteral(token: string): string | undefined {
    const t = token.trim();
    if (t.length >= 2 && ((t.startsWith("\"") && t.endsWith("\"")) || (t.startsWith("'") && t.endsWith("'")))) {
      return t.substring(1, t.length - 2);
    }
    return undefined;
  }

  static isNumberLiteral(token: string): boolean {
    if (token === "") return false;
    const parsed: int = 0;
    return Int32.tryParse(token, parsed);
  }

  static resolvePath(value: TemplateValue, segments: string[], scope: RenderScope): TemplateValue {
    let cur: TemplateValue = value;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (cur instanceof NilValue) return TemplateRuntime.nil;

      if (cur instanceof PageValue) {
        const pageValue = cur as PageValue;
        const page = pageValue.value;
        const k = seg.toLowerInvariant();
        if (k === "title") cur = new StringValue(page.title);
        else if (k === "content") cur = new HtmlValue(page.content);
        else if (k === "summary") cur = new HtmlValue(page.summary);
        else if (k === "date") cur = new StringValue(page.date);
        else if (k === "draft") cur = new BoolValue(page.draft);
        else if (k === "kind") cur = new StringValue(page.kind);
        else if (k === "section") cur = new StringValue(page.section);
        else if (k === "type") cur = new StringValue(page.type);
        else if (k === "slug") cur = new StringValue(page.slug);
        else if (k === "relpermalink") cur = new StringValue(page.relPermalink);
        else if (k === "permalink") {
          const rel = page.relPermalink.startsWith("/") ? page.relPermalink.substring(1) : page.relPermalink;
          cur = new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
        } else if (k === "site") cur = new SiteValue(page.site);
        else if (k === "pages") cur = new PageArrayValue(page.pages);
        else if (k === "description") cur = new StringValue(page.description);
        else if (k === "tags") cur = new StringArrayValue(page.tags);
        else if (k === "categories") cur = new StringArrayValue(page.categories);
        else if (k === "params") cur = new DictValue(page.Params);
        else if (k === "ishome") cur = new BoolValue(page.kind === "home");
        else if (k === "ispage") cur = new BoolValue(page.kind === "page");
        else if (k === "issection") cur = new BoolValue(page.kind === "section");
        else if (k === "istaxonomy") cur = new BoolValue(page.kind === "taxonomy");
        else if (k === "isterm") cur = new BoolValue(page.kind === "term");
        else if (k === "isnode") cur = new BoolValue(page.kind !== "page");
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof SiteValue) {
        const siteValue = cur as SiteValue;
        const site = siteValue.value;
        const k = seg.toLowerInvariant();
        if (k === "title") cur = new StringValue(site.title);
        else if (k === "baseurl") cur = new StringValue(site.baseURL);
        else if (k === "languagecode") cur = new StringValue(site.languageCode);
        else if (k === "params") cur = new DictValue(site.Params);
        else if (k === "pages") cur = new PageArrayValue(site.pages);
        else cur = TemplateRuntime.nil;
        continue;
      }

      if (cur instanceof DictValue) {
        const dictValue = cur as DictValue;
        const dict = dictValue.value;
        let v = "";
        if (dict.tryGetValue(seg, v)) {
          cur = new StringValue(v);
          continue;
        }
        const lower = seg.toLowerInvariant();
        if (dict.tryGetValue(lower, v)) {
          cur = new StringValue(v);
          continue;
        }
        cur = TemplateRuntime.nil;
        continue;
      }

      return TemplateRuntime.nil;
    }
    return cur;
  }

  static evalToken(token: string, scope: RenderScope): TemplateValue {
    const t = token.trim();
    if (t === ".") return scope.dot;
    if (t === "$") return new PageValue(scope.root);
    if (t.startsWith("$.")) {
      const segs = t.substring(2).split(".");
      return TemplateRuntime.resolvePath(new PageValue(scope.root), segs, scope);
    }
    if (t.startsWith(".")) {
      const segs = t.substring(1).split(".");
      return TemplateRuntime.resolvePath(scope.dot, segs, scope);
    }
    const lit = TemplateRuntime.parseStringLiteral(t);
    if (lit !== undefined) return new StringValue(lit);
    if (t === "true") return new BoolValue(true);
    if (t === "false") return new BoolValue(false);
    if (TemplateRuntime.isNumberLiteral(t)) return new NumberValue(Int32.parse(t));
    return new StringValue(t);
  }

  static convertGoDateLayoutToDotNet(layout: string): string {
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
  }

  static callFunction(nameRaw: string, args: TemplateValue[], scope: RenderScope): TemplateValue {
    const name = nameRaw.trim().toLowerInvariant();

    if (name === "safehtml" && args.length >= 1) {
      const v = args[0]!;
      if (v instanceof HtmlValue) return v;
      return new HtmlValue(new HtmlString(TemplateRuntime.toPlainString(v)));
    }

    if (name === "urlize" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(slugify(TemplateRuntime.toPlainString(v)));
    }

    if (name === "humanize" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(humanizeSlug(TemplateRuntime.toPlainString(v)));
    }

    if (name === "lower" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).toLowerInvariant());
    }

    if (name === "upper" && args.length >= 1) {
      const v = args[0]!;
      return new StringValue(TemplateRuntime.toPlainString(v).toUpperInvariant());
    }

    if (name === "relurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      return new StringValue(s.startsWith("/") ? s : "/" + s);
    }

    if (name === "absurl" && args.length >= 1) {
      const v = args[0]!;
      const s = TemplateRuntime.toPlainString(v);
      const rel = s.startsWith("/") ? s.substring(1) : s;
      return new StringValue(ensureTrailingSlash(scope.site.baseURL) + rel);
    }

    if (name === "default" && args.length >= 2) {
      const fallback = args[0]!;
      const v = args[1]!;
      return TemplateRuntime.isTruthy(v) ? v : fallback;
    }

    if (name === "len" && args.length >= 1) {
      const v = args[0]!;
      if (v instanceof StringValue) {
        const stringValue = v as StringValue;
        const l: int = stringValue.value.length;
        return new NumberValue(l);
      }
      if (v instanceof HtmlValue) {
        const htmlValue = v as HtmlValue;
        const l: int = htmlValue.value.value.length;
        return new NumberValue(l);
      }
      if (v instanceof PageArrayValue) {
        const pageArrayValue = v as PageArrayValue;
        const l: int = pageArrayValue.value.length;
        return new NumberValue(l);
      }
      if (v instanceof StringArrayValue) {
        const stringArrayValue = v as StringArrayValue;
        const l: int = stringArrayValue.value.length;
        return new NumberValue(l);
      }
      if (v instanceof DictValue) {
        const dictValue = v as DictValue;
        return new NumberValue(dictValue.value.count);
      }
      return new NumberValue(0);
    }

    if (name === "dateformat" && args.length >= 2) {
      const layout = TemplateRuntime.toPlainString(args[0]!);
      const s = TemplateRuntime.toPlainString(args[1]!);
      const parsed: DateTime = DateTime.minValue;
      const ok = DateTime.tryParse(s, parsed);
      if (!ok) return new StringValue("");
      const fmt = TemplateRuntime.convertGoDateLayoutToDotNet(layout);
      return new StringValue(parsed.toString(fmt));
    }

    if (name === "print" && args.length >= 1) {
      const sb = new StringBuilder();
      for (let i = 0; i < args.length; i++) sb.append(TemplateRuntime.toPlainString(args[i]!));
      return new StringValue(sb.toString());
    }

    if (name === "printf" && args.length >= 1) {
      const fmt = TemplateRuntime.toPlainString(args[0]!);
      const vals = new List<string>();
      for (let argIndex = 1; argIndex < args.length; argIndex++) vals.add(TemplateRuntime.toPlainString(args[argIndex]!));
      const values = vals.toArray();

      const sb = new StringBuilder();
      let pos = 0;
      let valueIndex = 0;
      while (pos < fmt.length) {
        const ch = fmt.substring(pos, 1);
        if (ch === "%" && pos + 1 < fmt.length) {
          const next = fmt.substring(pos + 1, 1);
          if (next === "%") {
            sb.append("%");
            pos += 2;
            continue;
          }
          if (next === "s") {
            if (valueIndex < values.length) sb.append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
          if (next === "d") {
            if (valueIndex < values.length) sb.append(values[valueIndex]!);
            valueIndex++;
            pos += 2;
            continue;
          }
        }
        sb.append(ch);
        pos++;
      }

      return new StringValue(sb.toString());
    }

    if (args.length >= 2) {
      const isCompare = name === "eq" || name === "ne" || name === "lt" || name === "le" || name === "gt" || name === "ge";
      if (isCompare) {
        const a = args[0]!;
        const b = args[1]!;

        let cmp = 0;
        if (a instanceof NumberValue && b instanceof NumberValue) {
          const aNum = a as NumberValue;
          const bNum = b as NumberValue;
          const av = aNum.value;
          const bv = bNum.value;
          cmp = av < bv ? -1 : av > bv ? 1 : 0;
        } else {
          const av = TemplateRuntime.toPlainString(a);
          const bv = TemplateRuntime.toPlainString(b);
          cmp = av.compareTo(bv);
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
      return new BoolValue(!TemplateRuntime.isTruthy(args[0]!));
    }

    if (name === "and" && args.length >= 1) {
      let cur = args[0]!;
      for (let i = 0; i < args.length; i++) {
        cur = args[i]!;
        if (!TemplateRuntime.isTruthy(cur)) return cur;
      }
      return cur;
    }

    if (name === "or" && args.length >= 1) {
      for (let i = 0; i < args.length; i++) {
        const cur = args[i]!;
        if (TemplateRuntime.isTruthy(cur)) return cur;
      }
      return args[args.length - 1]!;
    }

    return new StringValue("");
  }

  static evalStage(tokens: string[], scope: RenderScope, piped: TemplateValue | undefined): TemplateValue {
    if (tokens.length === 0) return piped ?? TemplateRuntime.nil;

    const head = tokens[0]!;
    const isValueLike =
      head === "." ||
      head === "$" ||
      head.startsWith(".") ||
      head.startsWith("$.") ||
      TemplateRuntime.parseStringLiteral(head) !== undefined ||
      head === "true" ||
      head === "false" ||
      TemplateRuntime.isNumberLiteral(head);

    if (piped === undefined && isValueLike && tokens.length === 1) {
      return TemplateRuntime.evalToken(head, scope);
    }

    const args = new List<TemplateValue>();
    for (let i = 1; i < tokens.length; i++) args.add(TemplateRuntime.evalToken(tokens[i]!, scope));
    if (piped !== undefined) args.add(piped);
    return TemplateRuntime.callFunction(head, args.toArray(), scope);
  }

  static trimRightWhitespace(s: string): string {
    return s.trimEnd();
  }

  static scanSegments(template: string): Segment[] {
    const segs = new List<Segment>();
    let i = 0;
    let lastSegment: Segment | undefined = undefined;

    while (i < template.length) {
      const start = indexOfTextFrom(template, "{{", i);
      if (start < 0) {
        const textSegment = new Segment(false, template.substring(i));
        segs.add(textSegment);
        lastSegment = textSegment;
        break;
      }

      if (start > i) {
        const textSegment = new Segment(false, template.substring(i, start - i));
        segs.add(textSegment);
        lastSegment = textSegment;
      }

      const end = indexOfTextFrom(template, "}}", start + 2);
      if (end < 0) {
        const textSegment = new Segment(false, template.substring(start));
        segs.add(textSegment);
        lastSegment = textSegment;
        break;
      }

      let action = template.substring(start + 2, end - (start + 2));
      let leftTrim = false;
      let rightTrim = false;

      if (action.startsWith("-")) {
        leftTrim = true;
        action = action.substring(1);
      }

      if (action.endsWith("-")) {
        rightTrim = true;
        action = action.substring(0, action.length - 1);
      }

      action = action.trim();

      if (leftTrim && lastSegment !== undefined && !lastSegment.isAction) {
        segs.removeAt(segs.count - 1);
        const trimmedTextSegment = new Segment(false, TemplateRuntime.trimRightWhitespace(lastSegment.text));
        segs.add(trimmedTextSegment);
        lastSegment = trimmedTextSegment;
      }

      const actionSegment = new Segment(true, action);
      segs.add(actionSegment);
      lastSegment = actionSegment;
      i = end + 2;

      if (rightTrim) {
        while (i < template.length) {
          const ch = template.substring(i, 1);
          if (ch !== " " && ch !== "\t" && ch !== "\r" && ch !== "\n") break;
          i++;
        }
      }
    }

    return segs.toArray();
  }

  static tokenizeAction(action: string): string[] {
    const tokens = new List<string>();
    let i = 0;

    const push = (t: string): void => {
      if (t !== "") tokens.add(t);
    };

    while (i < action.length) {
      const ch = action.substring(i, 1);
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        i++;
        continue;
      }
      if (ch === "|") {
        tokens.add("|");
        i++;
        continue;
      }
      if (ch === "\"" || ch === "'") {
        const quote = ch;
        i++;
        const quotedStart = i;
        while (i < action.length && action.substring(i, 1) !== quote) i++;
        const value = action.substring(quotedStart, i - quotedStart);
        push(quote + value + quote);
        if (i < action.length) i++;
        continue;
      }

      const tokenStart = i;
      while (i < action.length) {
        const c = action.substring(i, 1);
        if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "|") break;
        i++;
      }
      push(action.substring(tokenStart, i - tokenStart));
    }

    return tokens.toArray();
  }

  static parsePipeline(tokens: string[]): Pipeline {
    const stages = new List<string[]>();
    let current = new List<string>();

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t === "|") {
        stages.add(current.toArray());
        current = new List<string>();
        continue;
      }
      current.add(t);
    }
    stages.add(current.toArray());
    return new Pipeline(stages.toArray());
  }

  static sliceTokens(tokens: string[], startIndex: int): string[] {
    const out = new List<string>();
    for (let i = startIndex; i < tokens.length; i++) out.add(tokens[i]!);
    return out.toArray();
  }
}

class Segment {
  readonly isAction: boolean;
  readonly text: string;

  constructor(isAction: boolean, text: string) {
    this.isAction = isAction;
    this.text = text;
  }
}

class ParseNodesResult {
  readonly nodes: TemplateNode[];
  readonly endedWithElse: boolean;

  constructor(nodes: TemplateNode[], endedWithElse: boolean) {
    this.nodes = nodes;
    this.endedWithElse = endedWithElse;
  }
}

class Parser {
  readonly segs: Segment[];
  idx: int;
  readonly defines: Dictionary<string, TemplateNode[]>;
  private lastElseTokens: string[] | undefined;

  constructor(segs: Segment[]) {
    this.segs = segs;
    this.idx = 0;
    this.defines = new Dictionary<string, TemplateNode[]>();
    this.lastElseTokens = undefined;
  }

  private takeElseTokens(): string[] {
    const empty: string[] = [];
    const t = this.lastElseTokens ?? empty;
    this.lastElseTokens = undefined;
    return t;
  }

  private parseIfFrom(cond: Pipeline): IfNode {
    const thenBody = this.parseNodes(true);
    let elseNodes: TemplateNode[] = [];
    if (thenBody.endedWithElse) {
      const elseTokens = this.takeElseTokens();
      const isElseIf = elseTokens.length >= 2 && elseTokens[1] === "if";
      if (isElseIf) {
        const elseCond = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(elseTokens, 2));
        const nested = this.parseIfFrom(elseCond);
        elseNodes = [nested];
      } else {
        const elseBody = this.parseNodes(false);
        elseNodes = elseBody.nodes;
      }
    }
    return new IfNode(cond, thenBody.nodes, elseNodes);
  }

  parseNodes(stopOnElse: boolean): ParseNodesResult {
    const nodes = new List<TemplateNode>();

    while (this.idx < this.segs.length) {
      const seg = this.segs[this.idx]!;
      this.idx++;

      if (!seg.isAction) {
        nodes.add(new TextNode(seg.text));
        continue;
      }

      if (seg.text.startsWith("/*") && seg.text.endsWith("*/")) {
        continue;
      }

      const tokens = TemplateRuntime.tokenizeAction(seg.text);
      if (tokens.length === 0) continue;

      const head = tokens[0]!;
      if (head === "end") return new ParseNodesResult(nodes.toArray(), false);
      if (head === "else") {
        if (stopOnElse) {
          this.lastElseTokens = tokens;
          return new ParseNodesResult(nodes.toArray(), true);
        }
        continue;
      }

      if (head === "define" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const body = this.parseNodes(false);
        this.defines.remove(name);
        this.defines.add(name, body.nodes);
        continue;
      }

      if (head === "block" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        const ctx = TemplateRuntime.parsePipeline(ctxTokens);
        const body = this.parseNodes(false);
        nodes.add(new BlockNode(name, ctx, body.nodes));
        continue;
      }

      if (head === "if") {
        const cond = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        nodes.add(this.parseIfFrom(cond));
        continue;
      }

      if (head === "with") {
        const expr = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        const body = this.parseNodes(true);
        let elseNodes: TemplateNode[] = [];
        if (body.endedWithElse) {
          this.takeElseTokens();
          const elseBody = this.parseNodes(false);
          elseNodes = elseBody.nodes;
        }
        nodes.add(new WithNode(expr, body.nodes, elseNodes));
        continue;
      }

      if (head === "range") {
        const expr = TemplateRuntime.parsePipeline(TemplateRuntime.sliceTokens(tokens, 1));
        const body = this.parseNodes(true);
        let elseNodes: TemplateNode[] = [];
        if (body.endedWithElse) {
          this.takeElseTokens();
          const elseBody = this.parseNodes(false);
          elseNodes = elseBody.nodes;
        }
        nodes.add(new RangeNode(expr, body.nodes, elseNodes));
        continue;
      }

      if (head === "partial" && tokens.length >= 2) {
        const name = TemplateRuntime.parseStringLiteral(tokens[1]!) ?? tokens[1]!;
        const ctxTokens = tokens.length >= 3 ? TemplateRuntime.sliceTokens(tokens, 2) : ["."];
        nodes.add(new PartialNode(name, TemplateRuntime.parsePipeline(ctxTokens)));
        continue;
      }

      nodes.add(new OutputNode(TemplateRuntime.parsePipeline(tokens), true));
    }

    return new ParseNodesResult(nodes.toArray(), false);
  }
}

export const parseTemplate = (template: string): Template => {
  const segs = TemplateRuntime.scanSegments(template);
  const parser = new Parser(segs);
  const root = parser.parseNodes(false);
  return new Template(root.nodes, parser.defines);
};
