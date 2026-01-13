import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import { Console } from "@tsonic/dotnet/System.js";
import type { char } from "@tsonic/core/types.js";
import { fileExists, readTextFile, dirExists } from "./fs.ts";
import { parseTemplate, Template, TemplateEnvironment, TemplateNode } from "./template/index.ts";
import type { ResourceManager } from "./resources.ts";
import { I18nStore } from "./i18n.ts";
import { ModuleMount } from "./models.ts";

export class LayoutEnvironment extends TemplateEnvironment {
  private readonly siteLayoutsDir: string;
  private readonly themeLayoutsDir: string | undefined;
  private readonly mountedLayoutDirs: List<string>;
  private readonly cache: Dictionary<string, Template>;
  private readonly shortcodeCache: Dictionary<string, Template>;
  private readonly renderHookCache: Dictionary<string, Template>;
  private readonly i18nStore: I18nStore;

  constructor(siteDir: string, themeDir: string | undefined, mounts?: ModuleMount[]) {
    super();
    this.siteLayoutsDir = Path.combine(siteDir, "layouts");
    this.themeLayoutsDir = themeDir !== undefined ? Path.combine(themeDir, "layouts") : undefined;
    this.mountedLayoutDirs = new List<string>();
    this.cache = new Dictionary<string, Template>();
    this.shortcodeCache = new Dictionary<string, Template>();
    this.renderHookCache = new Dictionary<string, Template>();
    this.i18nStore = new I18nStore();
    this.i18nStore.loadFromDir(Path.combine(siteDir, "i18n"));
    if (themeDir !== undefined) {
      this.i18nStore.loadFromDir(Path.combine(themeDir, "i18n"));
    }

    // Process module mounts
    if (mounts !== undefined) {
      for (let i = 0; i < mounts.length; i++) {
        const mount = mounts[i]!;
        if (mount.target === "layouts") {
          // Resolve mount source relative to siteDir
          const mountPath = Path.isPathRooted(mount.source)
            ? mount.source
            : Path.combine(siteDir, mount.source);
          if (dirExists(mountPath)) {
            this.mountedLayoutDirs.add(mountPath);
          }
        } else if (mount.target === "i18n") {
          const mountPath = Path.isPathRooted(mount.source)
            ? mount.source
            : Path.combine(siteDir, mount.source);
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
    const slash: char = "/";
    const relPath = relPathRaw.trimStart(slash).trim();
    const withExt = relPath.endsWith(".html") ? relPath : relPath + ".html";
    const relOs = withExt.replace(slash, Path.directorySeparatorChar);

    const sitePath = Path.combine(this.siteLayoutsDir, relOs);
    let resolved: string | undefined = undefined;
    if (fileExists(sitePath)) {
      resolved = sitePath;
    } else if (this.themeLayoutsDir !== undefined) {
      const themePath = Path.combine(this.themeLayoutsDir, relOs);
      if (fileExists(themePath)) resolved = themePath;
    }

    // Check mounted layout directories
    if (resolved === undefined) {
      const mountDirs = this.mountedLayoutDirs.toArray();
      for (let i = 0; i < mountDirs.length; i++) {
        const mountPath = Path.combine(mountDirs[i]!, relOs);
        if (fileExists(mountPath)) {
          resolved = mountPath;
          break;
        }
      }
    }

    if (resolved === undefined) return undefined;
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.cache.tryGetValue(resolved, cached);
    if (hasCached) return cached;

    const text = readTextFile(resolved);
    try {
      const tpl = parseTemplate(text);
      this.cache.remove(resolved);
      this.cache.add(resolved, tpl);
      return tpl;
    } catch (e) {
      Console.writeLine(`Error parsing template: ${resolved}`);
      throw e;
    }
  }

  override getShortcodeTemplate(name: string): Template | undefined {
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.shortcodeCache.tryGetValue(name, cached);
    if (hasCached) return cached;

    const candidates = new List<string>();
    candidates.add(Path.combine(this.siteLayoutsDir, "shortcodes", name + ".html"));
    candidates.add(Path.combine(this.siteLayoutsDir, "_shortcodes", name + ".html"));
    if (this.themeLayoutsDir !== undefined) {
      candidates.add(Path.combine(this.themeLayoutsDir, "shortcodes", name + ".html"));
      candidates.add(Path.combine(this.themeLayoutsDir, "_shortcodes", name + ".html"));
    }
    // Check mounted layout directories
    const mountDirs = this.mountedLayoutDirs.toArray();
    for (let j = 0; j < mountDirs.length; j++) {
      candidates.add(Path.combine(mountDirs[j]!, "shortcodes", name + ".html"));
      candidates.add(Path.combine(mountDirs[j]!, "_shortcodes", name + ".html"));
    }

    let resolved: string | undefined = undefined;
    const candArr = candidates.toArray();
    for (let i = 0; i < candArr.length; i++) {
      const p = candArr[i]!;
      if (fileExists(p)) {
        resolved = p;
        break;
      }
    }

    if (resolved === undefined) return undefined;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text);
    this.shortcodeCache.remove(name);
    this.shortcodeCache.add(name, tpl);
    return tpl;
  }

  override getRenderHookTemplate(hookName: string): Template | undefined {
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.renderHookCache.tryGetValue(hookName, cached);
    if (hasCached) return cached;

    const candidates = new List<string>();
    candidates.add(Path.combine(this.siteLayoutsDir, "_markup", hookName + ".html"));
    candidates.add(Path.combine(this.siteLayoutsDir, "_default", "_markup", hookName + ".html"));
    if (this.themeLayoutsDir !== undefined) {
      candidates.add(Path.combine(this.themeLayoutsDir, "_markup", hookName + ".html"));
      candidates.add(Path.combine(this.themeLayoutsDir, "_default", "_markup", hookName + ".html"));
    }
    // Check mounted layout directories
    const hookMountDirs = this.mountedLayoutDirs.toArray();
    for (let j = 0; j < hookMountDirs.length; j++) {
      candidates.add(Path.combine(hookMountDirs[j]!, "_markup", hookName + ".html"));
      candidates.add(Path.combine(hookMountDirs[j]!, "_default", "_markup", hookName + ".html"));
    }

    let resolved: string | undefined = undefined;
    const candArr = candidates.toArray();
    for (let i = 0; i < candArr.length; i++) {
      const p = candArr[i]!;
      if (fileExists(p)) {
        resolved = p;
        break;
      }
    }

    if (resolved === undefined) return undefined;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text);
    this.renderHookCache.remove(hookName);
    this.renderHookCache.add(hookName, tpl);
    return tpl;
  }

  override getI18n(lang: string, key: string): string {
    return this.i18nStore.translate(lang, key);
  }
}
