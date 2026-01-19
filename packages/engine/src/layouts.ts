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
    this.siteLayoutsDir = Path.Combine(siteDir, "layouts");
    this.themeLayoutsDir = themeDir !== undefined ? Path.Combine(themeDir, "layouts") : undefined;
    this.mountedLayoutDirs = new List<string>();
    this.cache = new Dictionary<string, Template>();
    this.shortcodeCache = new Dictionary<string, Template>();
    this.renderHookCache = new Dictionary<string, Template>();
    this.i18nStore = new I18nStore();
    this.i18nStore.loadFromDir(Path.Combine(siteDir, "i18n"));
    if (themeDir !== undefined) {
      this.i18nStore.loadFromDir(Path.Combine(themeDir, "i18n"));
    }

    // Process module mounts
    if (mounts !== undefined) {
      for (let i = 0; i < mounts.Length; i++) {
        const mount = mounts[i]!;
        if (mount.target === "layouts") {
          // Resolve mount source relative to siteDir
          const mountPath = Path.IsPathRooted(mount.source)
            ? mount.source
            : Path.Combine(siteDir, mount.source);
          if (dirExists(mountPath)) {
            this.mountedLayoutDirs.Add(mountPath);
          }
        } else if (mount.target === "i18n") {
          const mountPath = Path.IsPathRooted(mount.source)
            ? mount.source
            : Path.Combine(siteDir, mount.source);
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
    const relPath = relPathRaw.TrimStart(slash).Trim();
    const withExt = relPath.EndsWith(".html") ? relPath : relPath + ".html";
    const relOs = withExt.Replace(slash, Path.DirectorySeparatorChar);

    const sitePath = Path.Combine(this.siteLayoutsDir, relOs);
    let resolved: string | undefined = undefined;
    if (fileExists(sitePath)) {
      resolved = sitePath;
    } else if (this.themeLayoutsDir !== undefined) {
      const themePath = Path.Combine(this.themeLayoutsDir, relOs);
      if (fileExists(themePath)) resolved = themePath;
    }

    // Check mounted layout directories
    if (resolved === undefined) {
      const mountDirs = this.mountedLayoutDirs.ToArray();
      for (let i = 0; i < mountDirs.Length; i++) {
        const mountPath = Path.Combine(mountDirs[i]!, relOs);
        if (fileExists(mountPath)) {
          resolved = mountPath;
          break;
        }
      }
    }

    if (resolved === undefined) return undefined;
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.cache.TryGetValue(resolved, cached);
    if (hasCached) return cached;

    const text = readTextFile(resolved);
    try {
      const tpl = parseTemplate(text);
      this.cache.Remove(resolved);
      this.cache.Add(resolved, tpl);
      return tpl;
    } catch (e) {
      Console.WriteLine(`Error parsing template: ${resolved}`);
      throw e;
    }
  }

  override getShortcodeTemplate(name: string): Template | undefined {
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.shortcodeCache.TryGetValue(name, cached);
    if (hasCached) return cached;

    const candidates = new List<string>();
    candidates.Add(Path.Combine(this.siteLayoutsDir, "shortcodes", name + ".html"));
    candidates.Add(Path.Combine(this.siteLayoutsDir, "_shortcodes", name + ".html"));
    if (this.themeLayoutsDir !== undefined) {
      candidates.Add(Path.Combine(this.themeLayoutsDir, "shortcodes", name + ".html"));
      candidates.Add(Path.Combine(this.themeLayoutsDir, "_shortcodes", name + ".html"));
    }
    // Check mounted layout directories
    const mountDirs = this.mountedLayoutDirs.ToArray();
    for (let j = 0; j < mountDirs.Length; j++) {
      candidates.Add(Path.Combine(mountDirs[j]!, "shortcodes", name + ".html"));
      candidates.Add(Path.Combine(mountDirs[j]!, "_shortcodes", name + ".html"));
    }

    let resolved: string | undefined = undefined;
    const candArr = candidates.ToArray();
    for (let i = 0; i < candArr.Length; i++) {
      const p = candArr[i]!;
      if (fileExists(p)) {
        resolved = p;
        break;
      }
    }

    if (resolved === undefined) return undefined;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text);
    this.shortcodeCache.Remove(name);
    this.shortcodeCache.Add(name, tpl);
    return tpl;
  }

  override getRenderHookTemplate(hookName: string): Template | undefined {
    const cachedNodes: TemplateNode[] = [];
    let cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.renderHookCache.TryGetValue(hookName, cached);
    if (hasCached) return cached;

    const candidates = new List<string>();
    candidates.Add(Path.Combine(this.siteLayoutsDir, "_markup", hookName + ".html"));
    candidates.Add(Path.Combine(this.siteLayoutsDir, "_default", "_markup", hookName + ".html"));
    if (this.themeLayoutsDir !== undefined) {
      candidates.Add(Path.Combine(this.themeLayoutsDir, "_markup", hookName + ".html"));
      candidates.Add(Path.Combine(this.themeLayoutsDir, "_default", "_markup", hookName + ".html"));
    }
    // Check mounted layout directories
    const hookMountDirs = this.mountedLayoutDirs.ToArray();
    for (let j = 0; j < hookMountDirs.Length; j++) {
      candidates.Add(Path.Combine(hookMountDirs[j]!, "_markup", hookName + ".html"));
      candidates.Add(Path.Combine(hookMountDirs[j]!, "_default", "_markup", hookName + ".html"));
    }

    let resolved: string | undefined = undefined;
    const candArr = candidates.ToArray();
    for (let i = 0; i < candArr.Length; i++) {
      const p = candArr[i]!;
      if (fileExists(p)) {
        resolved = p;
        break;
      }
    }

    if (resolved === undefined) return undefined;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text);
    this.renderHookCache.Remove(hookName);
    this.renderHookCache.Add(hookName, tpl);
    return tpl;
  }

  override getI18n(lang: string, key: string): string {
    return this.i18nStore.translate(lang, key);
  }
}
