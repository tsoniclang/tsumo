import { Exception } from "@tsonic/dotnet/System.js";
import type { ResourceManager } from "../resources.ts";
import type { Template } from "./template.ts";

export class TemplateEnvironment {
  /** True for production builds, false for dev/server mode. Defaults to true. */
  isProduction: boolean = true;

  getTemplate(_relPath: string): Template | undefined {
    throw new Exception("TemplateEnvironment.getTemplate is not implemented");
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

  getI18n(_lang: string, _key: string): string {
    return _key;
  }
}
