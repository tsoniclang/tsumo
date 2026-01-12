import { Path } from "@tsonic/dotnet/System.IO.js";
import { SiteConfig } from "../models.ts";
import { readTextFile } from "../fs.ts";
import { LoadedConfig } from "./loaded-config.ts";
import { tryGetFirstExisting } from "./helpers.ts";
import { parseTomlConfig } from "./toml.ts";
import { parseYamlConfig } from "./yaml.ts";
import { parseJsonConfig } from "./json.ts";

export const loadSiteConfig = (siteDir: string): LoadedConfig => {
  const candidates = [
    Path.combine(siteDir, "hugo.toml"),
    Path.combine(siteDir, "hugo.yaml"),
    Path.combine(siteDir, "hugo.yml"),
    Path.combine(siteDir, "hugo.json"),
    Path.combine(siteDir, "config.toml"),
    Path.combine(siteDir, "config.yaml"),
    Path.combine(siteDir, "config.yml"),
    Path.combine(siteDir, "config.json"),
  ];

  const path = tryGetFirstExisting(candidates);
  if (path === undefined) {
    const defaultConfig = new SiteConfig("Tsumo Site", "", "en-us", undefined);
    return new LoadedConfig(undefined, defaultConfig);
  }

  const text = readTextFile(path);
  const lower = path.toLowerInvariant();
  const parsedConfig =
    lower.endsWith(".toml") ? parseTomlConfig(text) : lower.endsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, parsedConfig);
};
