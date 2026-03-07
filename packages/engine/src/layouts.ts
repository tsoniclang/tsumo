import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { char } from "@tsonic/core/types.js";
import { isAbsolute, join, sep } from "node:path";
import { dirExists, fileExists, readTextFile } from "./fs.ts";
import { parseTemplate, Template, TemplateEnvironment, TemplateNode } from "./template/index.ts";
import type { ResourceManager } from "./resources.ts";
import { I18nStore } from "./i18n.ts";
import { ModuleMount } from "./models.ts";
import { replaceText, trimStartChar } from "./utils/strings.ts";

export class LayoutEnvironment extends TemplateEnvironment {
  private readonly siteLayoutsDir: string;
  private readonly themeLayoutsDir: string | undefined;
  private readonly mountedLayoutDirs: string[];
  private readonly cache: Map<string, Template>;
  private readonly shortcodeCache: Map<string, Template>;
  private readonly renderHookCache: Map<string, Template>;
  private readonly i18nStore: I18nStore;

  constructor(siteDir: string, themeDir: string | undefined, mounts?: ModuleMount[]) {
    super();
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

  override getResourceManager(): ResourceManager | undefined {
    return undefined;
  }

  override getTemplate(relPathRaw: string): Template | undefined {
    const slash = "/";
    const relPath = trimStartChar(relPathRaw, slash).trim();
    const withExt = relPath.endsWith(".html") ? relPath : relPath + ".html";
    const relOs = replaceText(withExt, slash, `${sep}`);

    const candidates: string[] = [join(this.siteLayoutsDir, relOs)];
    if (this.themeLayoutsDir !== undefined) {
      candidates.push(join(this.themeLayoutsDir, relOs));
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
    try {
      const tpl = parseTemplate(text);
      this.cache.set(resolved, tpl);
      return tpl;
    } catch (e) {
      console.error(`Error parsing template: ${resolved}`);
      throw e;
    }
  }

  override getShortcodeTemplate(name: string): Template | undefined {
    const cached = this.shortcodeCache.get(name);
    if (cached !== undefined) return cached;

    const candidates: string[] = [
      join(this.siteLayoutsDir, "shortcodes", name + ".html"),
      join(this.siteLayoutsDir, "_shortcodes", name + ".html"),
    ];
    if (this.themeLayoutsDir !== undefined) {
      candidates.push(join(this.themeLayoutsDir, "shortcodes", name + ".html"));
      candidates.push(join(this.themeLayoutsDir, "_shortcodes", name + ".html"));
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

    const tpl = parseTemplate(readTextFile(resolved));
    this.shortcodeCache.set(name, tpl);
    return tpl;
  }

  override getRenderHookTemplate(hookName: string): Template | undefined {
    const cached = this.renderHookCache.get(hookName);
    if (cached !== undefined) return cached;

    const candidates: string[] = [
      join(this.siteLayoutsDir, "_markup", hookName + ".html"),
      join(this.siteLayoutsDir, "_default", "_markup", hookName + ".html"),
    ];
    if (this.themeLayoutsDir !== undefined) {
      candidates.push(join(this.themeLayoutsDir, "_markup", hookName + ".html"));
      candidates.push(join(this.themeLayoutsDir, "_default", "_markup", hookName + ".html"));
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

    const tpl = parseTemplate(readTextFile(resolved));
    this.renderHookCache.set(hookName, tpl);
    return tpl;
  }

  override getI18n(lang: string, key: string): string {
    return this.i18nStore.translate(lang, key);
  }
}
