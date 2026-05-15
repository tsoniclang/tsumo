import { SiteConfig } from "../models.ts";

export class LoadedConfig {
  path: string | undefined;
  config: SiteConfig;

  constructor(path: string | undefined, config: SiteConfig) {
    this.path = path;
    this.config = config;
  }
}
