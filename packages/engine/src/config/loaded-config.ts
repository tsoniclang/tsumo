import { SiteConfig } from "../models.ts";

export class LoadedConfig {
  readonly path: string | undefined;
  readonly config: SiteConfig;

  constructor(path: string | undefined, config: SiteConfig) {
    this.path = path;
    this.config = config;
  }
}
