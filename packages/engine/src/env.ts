import { LayoutEnvironment } from "./layouts.js";
import { ResourceManager } from "./resources.js";
import { ModuleMount } from "./models.js";

export class BuildEnvironment extends LayoutEnvironment {
  siteDir: string;
  themeDir: string | undefined;
  outputDir: string;
  resources: ResourceManager;

  constructor(siteDir: string, themeDir: string | undefined, outputDir: string, mounts?: ModuleMount[]) {
    super(siteDir, themeDir, mounts);
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.resources = new ResourceManager(siteDir, themeDir, outputDir);
  }

  getResourceManager(): ResourceManager | undefined {
    return this.resources;
  }
}
