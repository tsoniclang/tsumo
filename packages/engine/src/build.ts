import type { int } from "@tsonic/csharp/types.js";

export class BuildRequest {
  siteDir: string;
  destinationDir: string;
  baseURL: string | undefined;
  themesDir: string | undefined;
  buildDrafts: boolean;
  cleanDestinationDir: boolean;
  buildTime: Date;

  constructor(siteDir: string) {
    this.siteDir = siteDir;
    this.destinationDir = "public";
    this.baseURL = undefined;
    this.themesDir = undefined;
    this.buildDrafts = false;
    this.cleanDestinationDir = true;
    this.buildTime = new Date();
  }
}

export class ServeRequest extends BuildRequest {
  host: string;
  port: int;
  watch: boolean;

  constructor(siteDir: string) {
    super(siteDir);
    this.host = "localhost";
    this.port = 1313;
    this.watch = true;
  }
}

export class BuildResult {
  outputDir: string;
  pagesBuilt: int;

  constructor(outputDir: string, pagesBuilt: int) {
    this.outputDir = outputDir;
    this.pagesBuilt = pagesBuilt;
  }
}
