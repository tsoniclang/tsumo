import { Char } from "@tsonic/dotnet/System.js";
import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import type { char } from "@tsonic/core/types.js";
import { fileExists, readTextFile } from "./fs.ts";
import { parseTemplate, Template, TemplateEnvironment, TemplateNode } from "./template.ts";

export class LayoutEnvironment extends TemplateEnvironment {
  private readonly siteLayoutsDir: string;
  private readonly themeLayoutsDir: string | undefined;
  private readonly cache: Dictionary<string, Template>;

  constructor(siteDir: string, themeDir: string | undefined) {
    super();
    this.siteLayoutsDir = Path.combine(siteDir, "layouts");
    this.themeLayoutsDir = themeDir !== undefined ? Path.combine(themeDir, "layouts") : undefined;
    this.cache = new Dictionary<string, Template>();
  }

  override getTemplate(relPathRaw: string): Template | undefined {
    const slash: char = Char.parse("/");
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

    if (resolved === undefined) return undefined;
    const cachedNodes: TemplateNode[] = [];
    const cached = new Template(cachedNodes, new Dictionary<string, TemplateNode[]>());
    const hasCached = this.cache.tryGetValue(resolved, cached);
    if (hasCached) return cached;

    const text = readTextFile(resolved);
    const tpl = parseTemplate(text);
    this.cache.remove(resolved);
    this.cache.add(resolved, tpl);
    return tpl;
  }
}
