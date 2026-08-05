import { SiteConfig } from "../models.js";

export class LoadedConfig {
  path: string | undefined;
  config: SiteConfig;

  constructor(path: string | undefined, config: SiteConfig) {
    this.path = path;
    this.config = config;
  }
}
