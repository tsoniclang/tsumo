import { createTsumoError } from "../diagnostics.js";
import type { SiteContext } from "../models.js";
import type { ResourceManager } from "../resources.js";
import type { TemplateNode } from "./nodes.js";
import type { Template } from "./template.js";
import type { TemplateValue } from "./values.js";

export class TemplateEnvironment {
  /** True for production builds, false for dev/server mode. Defaults to true. */
  isProduction: boolean = true;

  getTemplate(_relPath: string): Template | undefined {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.getTemplate is not implemented");
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

  renderTemplateSource(
    _source: string,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
  ): string {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.renderTemplateSource is not implemented");
  }

  renderTemplate(
    _template: Template,
    _context: TemplateValue,
    _site: SiteContext,
    _overrides: Map<string, TemplateNode[]>,
  ): string {
    throw createTsumoError("TSUMO_TEMPLATE_ENVIRONMENT_OPERATION_UNAVAILABLE", "TemplateEnvironment.renderTemplate is not implemented");
  }

  getI18n(_lang: string, _key: string): string {
    return _key;
  }
}
