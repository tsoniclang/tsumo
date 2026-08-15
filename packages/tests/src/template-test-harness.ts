import { Exception } from "@tsonic/dotnet/System.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import type { int32 } from "@tsonic/core/types.js";

import {
  DictValue, HtmlString, I18nStore, PageContext, parseTemplate, RenderScope, RenderState, ResourceManager,
  SiteConfig, SiteContext, Template, TemplateEnvironment, TemplateNode, TemplateValue, TsumoError,
} from "@tsumo/engine/testing.js";

export class TestTemplateEnvironment extends TemplateEnvironment {
  templates: Map<string, Template>;
  resourceManager: ResourceManager | undefined;
  i18nStore: I18nStore | undefined;

  constructor(resourceManager?: ResourceManager) {
    super(new Date(1704067200000));
    this.templates = new Map<string, Template>();
    this.resourceManager = resourceManager;
    this.i18nStore = undefined;
  }

  getEnvironmentVariable(name: string): string | undefined {
    return name === "TSUMO_TEST_VALUE" ? "configured" : undefined;
  }

  sourceFileExists(path: string): boolean {
    return path === "static/existing.css";
  }

  getTemplate(path: string): Template | undefined {
    return this.templates.get(path);
  }

  getTemplateSourceRelativePath(sourcePath: string): string | undefined {
    return sourcePath;
  }

  getResourceManager(): ResourceManager | undefined {
    return this.resourceManager;
  }

  getI18n(lang: string, key: string, count?: int32): string {
    return this.i18nStore?.translate(lang, key, count) ?? key;
  }

  renderTextTemplateSource(
    source: string,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state?: RenderState,
  ): string {
    return this.renderTextTemplate(parseTemplate(source), context, site, overrides, state);
  }

  renderPageView(page: PageContext, view: string, _state: RenderState | undefined): string | undefined {
    return view === "summary" ? `<summary>${page.title}</summary>` : undefined;
  }

  renderTemplate(
    template: Template,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state?: RenderState,
  ): string {
    const output = new StringBuilder();
    const scope = new RenderScope(context, context, site, this, undefined, state, template.sourcePath);
    template.renderInto(output, scope, this, overrides);
    return output.ToString();
  }

  renderTextTemplate(
    template: Template,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state?: RenderState,
  ): string {
    const output = new StringBuilder();
    const scope = new RenderScope(context, context, site, this, undefined, state, template.sourcePath);
    template.renderTextInto(output, scope, this, overrides);
    return output.ToString();
  }

  renderTemplateDefinition(
    nodes: TemplateNode[],
    definitions: Map<string, TemplateNode[]>,
    sourcePath: string | undefined,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
    state?: RenderState,
  ): string {
    return this.renderTemplate(new Template(nodes, definitions, sourcePath), context, site, overrides, state);
  }
}

export const createSite = (): SiteContext => {
  const config = new SiteConfig("Test Site", "https://example.test/", "en", undefined, undefined);
  return new SiteContext(config, [], undefined, undefined);
};

export const renderWithRoot = (source: string, root: TemplateValue): string => {
  const template = parseTemplate(source);
  const environment = new TestTemplateEnvironment();
  const site = createSite();
  const scope = new RenderScope(root, root, site, environment, undefined);
  const output = new StringBuilder();
  template.renderInto(output, scope, environment, new Map());
  return output.ToString();
};

export const render = (source: string): string =>
  renderWithRoot(source, new DictValue(new Map<string, TemplateValue>()));

export const createPage = (site: SiteContext, title: string, date: string, kind: string): PageContext => {
  const emptyPages: PageContext[] = [];
  const emptyStrings: string[] = [];
  const emptyHtml = new HtmlString("");
  return new PageContext(
    title, date, date, false, kind, kind === "page" ? "posts" : "", kind,
    title.toLowerCase(), `/${title.toLowerCase()}/`, "", emptyHtml,
    new HtmlString(`<p>${title}</p>`), new HtmlString(`<p>${title}</p>`), "",
    emptyStrings, emptyStrings, new Map(), undefined, site.Language, emptyPages,
    undefined, site, emptyPages, undefined, emptyPages, undefined,
  );
};

export const captureDiagnosticCode = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a TsumoError diagnostic");
};

export const captureDiagnostic = (operation: () => void): TsumoError => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error;
    throw error;
  }
  throw new Exception("Expected a TsumoError diagnostic");
};
