import type { char } from "@tsonic/core/types.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { isAbsolute, join, sep } from "node:path";
import { dirExists, fileExists, readTextFile } from "./fs.js";
import { parseTemplate, Template, TemplateEnvironment, TemplateNode } from "./template/index.js";
import type { ResourceManager } from "./resources.js";
import { I18nStore } from "./i18n.js";
import { ModuleMount } from "./models.js";
import type { SiteContext } from "./models.js";
import { replaceText, trimStartChar } from "./utils/strings.js";
import { RenderScope } from "./template/scope.js";
import type { TemplateValue } from "./template/values.js";

export class LayoutEnvironment extends TemplateEnvironment {
  siteLayoutsDir: string;
  themeLayoutsDir: string | undefined;
  mountedLayoutDirs: string[];
  cache: Map<string, Template>;
  shortcodeCache: Map<string, Template>;
  renderHookCache: Map<string, Template>;
  i18nStore: I18nStore;

  constructor(siteDir: string, themeDirRaw: string | undefined, mountsRaw?: ModuleMount[]) {
    super();
    const themeDir = themeDirRaw;
    const mounts = mountsRaw;
    this.siteLayoutsDir = join(siteDir, "layouts");
    this.themeLayoutsDir = themeDir !== undefined ? join(themeDir, "layouts") : undefined;
    this.mountedLayoutDirs = [];
    this.cache = new Map<string, Template>();
    this.shortcodeCache = new Map<string, Template>();
    this.renderHookCache = new Map<string, Template>();
    this.i18nStore = new I18nStore();
    this.i18nStore.loadFromDir(join(siteDir, "i18n"));
    if (themeDir !== undefined) {
      this.i18nStore.loadFromDir(join(themeDir, "i18n"));
    }

    if (mounts !== undefined) {
      for (let i = 0; i < mounts.length; i++) {
        const mount = mounts[i]!;
        if (mount.target === "layouts") {
          const mountPath = isAbsolute(mount.source) ? mount.source : join(siteDir, mount.source);
          if (dirExists(mountPath)) {
            this.mountedLayoutDirs.push(mountPath);
          }
        } else if (mount.target === "i18n") {
          const mountPath = isAbsolute(mount.source) ? mount.source : join(siteDir, mount.source);
          if (dirExists(mountPath)) {
            this.i18nStore.loadFromDir(mountPath);
          }
        }
      }
    }
  }

  getResourceManager(): ResourceManager | undefined {
    return undefined;
  }

  renderTemplateSource(
    source: string,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
  ): string {
    return this.renderTemplate(parseTemplate(source), context, site, overrides);
  }

  renderTemplate(
    template: Template,
    context: TemplateValue,
    site: SiteContext,
    overrides: Map<string, TemplateNode[]>,
  ): string {
    const output = new StringBuilder();
    const scope = new RenderScope(context, context, site, this, undefined);
    template.renderInto(output, scope, this, overrides);
    return output.ToString();
  }

  getTemplate(relPathRaw: string): Template | undefined {
    const slash = "/";
    const relPath = trimStartChar(relPathRaw, slash).trim();
    const withExt = relPath.endsWith(".html") ? relPath : relPath + ".html";
    const relOs = replaceText(withExt, slash, `${sep}`);

    const candidates: string[] = [join(this.siteLayoutsDir, relOs)];
    const themeLayoutsDir = this.themeLayoutsDir;
    if (themeLayoutsDir !== undefined) {
      candidates.push(join(themeLayoutsDir, relOs));
    }
    for (let i = 0; i < this.mountedLayoutDirs.length; i++) {
      candidates.push(join(this.mountedLayoutDirs[i]!, relOs));
    }

    let resolved: string | undefined = undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (fileExists(candidate)) {
        resolved = candidate;
        break;
      }
    }
    if (resolved === undefined) return undefined;

    const cached = this.cache.get(resolved);
    if (cached !== undefined) return cached;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text, resolved);
    this.cache.set(resolved, tpl);
    return tpl;
  }

  getShortcodeTemplate(name: string): Template | undefined {
    const cached = this.shortcodeCache.get(name);
    if (cached !== undefined) return cached;

    const candidates: string[] = [
      join(this.siteLayoutsDir, "shortcodes", name + ".html"),
      join(this.siteLayoutsDir, "_shortcodes", name + ".html"),
    ];
    const themeLayoutsDir = this.themeLayoutsDir;
    if (themeLayoutsDir !== undefined) {
      candidates.push(join(themeLayoutsDir, "shortcodes", name + ".html"));
      candidates.push(join(themeLayoutsDir, "_shortcodes", name + ".html"));
    }
    for (let i = 0; i < this.mountedLayoutDirs.length; i++) {
      const dir = this.mountedLayoutDirs[i]!;
      candidates.push(join(dir, "shortcodes", name + ".html"));
      candidates.push(join(dir, "_shortcodes", name + ".html"));
    }

    let resolved: string | undefined = undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (fileExists(candidate)) {
        resolved = candidate;
        break;
      }
    }
    if (resolved === undefined) return undefined;

    const tpl = parseTemplate(readTextFile(resolved), resolved);
    this.shortcodeCache.set(name, tpl);
    return tpl;
  }

  getRenderHookTemplate(hookName: string): Template | undefined {
    const cached = this.renderHookCache.get(hookName);
    if (cached !== undefined) return cached;

    const candidates: string[] = [
      join(this.siteLayoutsDir, "_markup", hookName + ".html"),
      join(this.siteLayoutsDir, "_default", "_markup", hookName + ".html"),
    ];
    const themeLayoutsDir = this.themeLayoutsDir;
    if (themeLayoutsDir !== undefined) {
      candidates.push(join(themeLayoutsDir, "_markup", hookName + ".html"));
      candidates.push(join(themeLayoutsDir, "_default", "_markup", hookName + ".html"));
    }
    for (let i = 0; i < this.mountedLayoutDirs.length; i++) {
      const dir = this.mountedLayoutDirs[i]!;
      candidates.push(join(dir, "_markup", hookName + ".html"));
      candidates.push(join(dir, "_default", "_markup", hookName + ".html"));
    }

    let resolved: string | undefined = undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (fileExists(candidate)) {
        resolved = candidate;
        break;
      }
    }
    if (resolved === undefined) return undefined;

    const tpl = parseTemplate(readTextFile(resolved), resolved);
    this.renderHookCache.set(hookName, tpl);
    return tpl;
  }

  getI18n(lang: string, key: string): string {
    return this.i18nStore.translate(lang, key);
  }
}
