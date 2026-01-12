import { LayoutEnvironment } from "./layouts.ts";
import { ResourceManager } from "./resources.ts";

export class BuildEnvironment extends LayoutEnvironment {
  readonly siteDir: string;
  readonly themeDir: string | undefined;
  readonly outputDir: string;
  readonly resources: ResourceManager;

  constructor(siteDir: string, themeDir: string | undefined, outputDir: string) {
    super(siteDir, themeDir);
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.resources = new ResourceManager(siteDir, themeDir, outputDir);
  }

  override getResourceManager(): ResourceManager | undefined {
    return this.resources;
  }
}
