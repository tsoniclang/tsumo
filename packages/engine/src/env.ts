import { LayoutEnvironment } from "./layouts.js";
import { ResourceManager } from "./resources.js";
import { ModuleMount } from "./models.js";
import { Environment } from "@tsonic/dotnet/System.js";

export class BuildEnvironment extends LayoutEnvironment {
  siteDir: string;
  themeDir: string | undefined;
  outputDir: string;
  resources: ResourceManager;

  constructor(siteDir: string, themeDir: string | undefined, outputDir: string, mounts?: ModuleMount[], buildTime?: Date) {
    super(siteDir, themeDir, mounts, buildTime);
    this.siteDir = siteDir;
    this.themeDir = themeDir;
    this.outputDir = outputDir;
    this.resources = new ResourceManager(siteDir, themeDir, outputDir);
  }

  getResourceManager(): ResourceManager | undefined {
    return this.resources;
  }

  getEnvironmentVariable(name: string): string | undefined {
    return Environment.GetEnvironmentVariable(name) ?? undefined;
  }
}
