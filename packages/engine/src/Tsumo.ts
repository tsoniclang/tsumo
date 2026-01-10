import { buildSite } from "./builder.ts";
import { BuildRequest, BuildResult, ServeRequest } from "./models.ts";
import { initSite, newContent } from "./scaffold.ts";
import { serveSite } from "./server.ts";

export class Tsumo {
  static initSite(targetDir: string): void {
    initSite(targetDir);
  }

  static newContent(siteDir: string, contentPath: string): string {
    return newContent(siteDir, contentPath);
  }

  static build(req: BuildRequest): BuildResult {
    return buildSite(req);
  }

  static serve(req: ServeRequest): void {
    serveSite(req);
  }
}

