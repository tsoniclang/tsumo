import { createTsumoError } from "../diagnostics.js";
import type { SiteContext } from "../models.js";
import type { PageContext } from "../models.js";
import type { ResourceManager } from "../resources.js";
import type { TemplateNode } from "./nodes.js";
import type { Template } from "./template.js";
import { DeferredTemplateValue, DictValue, ScratchStore, TemplateValue } from "./values.js";
import type { RenderState } from "./scope.js";
import { partialTemplateCandidates } from "./paths.js";
import type { int32 } from "@tsonic/core/types.js";

class DeferredTemplateRequest {
  key: string | undefined;
  body: TemplateNode[];
  definitions: Map<string, TemplateNode[]>;
  sourcePath: string | undefined;
  sourceText: string;
  sourceSegmentIndex: int32;
  data: TemplateValue;
  site: SiteContext;
  overrides: Map<string, TemplateNode[]>;
  state: RenderState;
  result: string | undefined;

  constructor(
    value: DeferredTemplateValue,
    body: TemplateNode[],
    definitions: Map<string, TemplateNode[]>,
    sourcePath: string | undefined,
    sourceText: string,
    sourceSegmentIndex: int32,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state: RenderState,
  ) {
    this.key = value.key;
    this.body = body;
    this.definitions = definitions;
    this.sourcePath = sourcePath;
    this.sourceText = sourceText;
    this.sourceSegmentIndex = sourceSegmentIndex;
    this.data = value.data;
    this.site = site;
    this.overrides = overrides;
    this.state = state;
    this.result = undefined;
  }
}

class DeferredTemplatePlacement {
  token: string;
  request: DeferredTemplateRequest;

  constructor(token: string, request: DeferredTemplateRequest) {
    this.token = token;
    this.request = request;
  }
}

export class PartialTemplateResolution {
  kind: "definition" | "template";
  definition: TemplateNode[] | undefined;
  template: Template | undefined;
  sourcePath: string | undefined;

  constructor(
    kind: "definition" | "template",
    definition: TemplateNode[] | undefined,
    template: Template | undefined,
    sourcePath: string | undefined,
  ) {
    this.kind = kind;
    this.definition = definition;
    this.template = template;
    this.sourcePath = sourcePath;
  }
}

export class TemplateEnvironment {
  /** True for production builds, false for dev/server mode. Defaults to true. */
  isProduction: boolean = true;
  buildTime: Date;
  deferredRequests: DeferredTemplateRequest[];
  deferredPlacements: DeferredTemplatePlacement[];
  deferredPhase: "collecting" | "finalizing" | "finalized";
  siteData: DictValue;
  globalStore: ScratchStore;

  constructor(buildTime?: Date, siteData?: DictValue) {
    this.buildTime = buildTime ?? new Date();
    this.deferredRequests = [];
    this.deferredPlacements = [];
    this.deferredPhase = "collecting";
    this.siteData = siteData ?? new DictValue(new Map<string, TemplateValue>());
    this.globalStore = new ScratchStore();
  }

  registerDeferredTemplate(
    value: DeferredTemplateValue,
    body: TemplateNode[],
    definitions: Map<string, TemplateNode[]>,
    sourcePath: string | undefined,
    sourceText: string,
    sourceSegmentIndex: int32,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state: RenderState,
  ): string {
    if (this.deferredPhase !== "collecting") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_DEFER_LIFECYCLE_INVALID",
        "templates.Defer cannot register work after deferred-template finalization begins",
      );
    }

    let request: DeferredTemplateRequest | undefined = undefined;
    if (value.key !== undefined) {
      for (let index = 0; index < this.deferredRequests.length; index++) {
        const candidate = this.deferredRequests[index]!;
        if (
          candidate.key === value.key &&
          candidate.sourcePath === sourcePath &&
          candidate.sourceText === sourceText &&
          candidate.sourceSegmentIndex === sourceSegmentIndex
        ) {
          request = candidate;
          break;
        }
      }
    }
    if (request === undefined) {
      request = new DeferredTemplateRequest(
        value,
        body,
        definitions,
        sourcePath,
        sourceText,
        sourceSegmentIndex,
        site,
        overrides,
        state,
      );
      this.deferredRequests.push(request);
    }

    const ordinal: int32 = this.deferredPlacements.length;
    const token = `\u0000TSUMO-DEFERRED-TEMPLATE:${ordinal}\u0000`;
    this.deferredPlacements.push(new DeferredTemplatePlacement(token, request));
    return token;
  }

  finalizeDeferredTemplates(): Map<string, string> {
    if (this.deferredPhase === "finalizing") {
      throw createTsumoError("TSUMO_TEMPLATE_DEFER_LIFECYCLE_INVALID", "Deferred-template finalization is already running");
    }
    if (this.deferredPhase === "collecting") {
      this.deferredPhase = "finalizing";
      for (let index = 0; index < this.deferredRequests.length; index++) {
        const request = this.deferredRequests[index]!;
        request.result = this.renderTemplateDefinition(
          request.body,
          request.definitions,
          request.sourcePath,
          request.data,
          request.site,
          request.overrides,
          request.state,
        );
      }
      this.deferredPhase = "finalized";
    }

    const results = new Map<string, string>();
    for (let index = 0; index < this.deferredPlacements.length; index++) {
      const placement = this.deferredPlacements[index]!;
      const result = placement.request.result;
      if (result === undefined) {
        throw createTsumoError("TSUMO_TEMPLATE_DEFER_LIFECYCLE_INVALID", "A deferred template has no finalized output");
      }
      results.set(placement.token, result);
    }
    return results;
  }

  getEnvironmentVariable(_name: string): string | undefined {
    return undefined;
  }

  setSiteData(value: DictValue): void {
    this.siteData = value;
  }

  getSiteData(): DictValue {
    return this.siteData;
  }

  getGlobalStore(): ScratchStore {
    return this.globalStore;
  }

  sourceFileExists(_path: string): boolean {
    return false;
  }

  getTemplate(_relPath: string): Template | undefined {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.getTemplate is not implemented");
  }

  getTemplateSourceRelativePath(_sourcePath: string): string | undefined {
    return undefined;
  }

  resolvePartialTemplate(
    name: string,
    callerSourcePath: string | undefined,
    definitions: Map<string, TemplateNode[]>,
  ): PartialTemplateResolution | undefined {
    let callerRelativePath: string | undefined = undefined;
    if (callerSourcePath !== undefined) {
      const selectedSourcePath = callerSourcePath as string;
      callerRelativePath = this.getTemplateSourceRelativePath(selectedSourcePath);
    }
    const candidates = partialTemplateCandidates(name, callerRelativePath);
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]!;
      const definition = definitions.get(candidate);
      if (definition !== undefined) {
        return new PartialTemplateResolution("definition", definition, undefined, callerSourcePath);
      }
      const template = this.getTemplate(candidate);
      if (template !== undefined) {
        const selected = template.withInheritedDefinitions(definitions);
        return new PartialTemplateResolution("template", undefined, selected, selected.sourcePath);
      }
    }
    return undefined;
  }

  renderPageView(_page: PageContext, _view: string, _state: RenderState | undefined): string | undefined {
    return undefined;
  }

  getShortcodeTemplate(_name: string): Template | undefined {
    return undefined;
  }

  getRenderHookTemplate(_hookName: string): Template | undefined {
    return undefined;
  }

  getResourceManager(): ResourceManager | undefined {
    return undefined;
  }

  renderTextTemplateSource(
    _source: string,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
    _state?: RenderState,
  ): string {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.renderTextTemplateSource is not implemented");
  }

  renderTemplate(
    _template: Template,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
    _state?: RenderState,
  ): string {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.renderTemplate is not implemented");
  }

  renderTextTemplate(
    _template: Template,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
    _state?: RenderState,
  ): string {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.renderTextTemplate is not implemented");
  }

  renderTemplateDefinition(
    _nodes: TemplateNode[],
    _definitions: Map<string, TemplateNode[]>,
    _sourcePath: string | undefined,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
    _state?: RenderState,
  ): string {
    throw createTsumoError(
      "TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE",
      "TemplateEnvironment.renderTemplateDefinition is not implemented",
    );
  }

  getI18n(_lang: string, _key: string, _count?: int32): string {
    return _key;
  }
}
