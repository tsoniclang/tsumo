import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import { SiteConfig, ModuleMount } from "../models.ts";
import { readTextFile, dirExists, fileExists } from "../fs.ts";
import { LoadedConfig } from "./loaded-config.ts";
import { tryGetFirstExisting } from "./helpers.ts";
import { parseTomlConfig, mergeTomlIntoConfig, parseModuleToml } from "./toml.ts";
import { parseYamlConfig, mergeYamlIntoConfig } from "./yaml.ts";
import { parseJsonConfig } from "./json.ts";

const loadSplitConfig = (configDir: string): SiteConfig => {
  // Start with default config
  let config = new SiteConfig("Tsumo Site", "", "en-us", undefined);

  // Get all config files in the directory
  const files = Directory.GetFiles(configDir);

  // Sort files to process base config first, then params, then languages/menus
  const sortedFiles = new List<string>();
  const baseFiles = new List<string>();
  const paramFiles = new List<string>();
  const langFiles = new List<string>();
  const menuFiles = new List<string>();
  const moduleFiles = new List<string>();
  const otherFiles = new List<string>();

  for (let i = 0; i < files.Length; i++) {
    const f = files[i]!;
    const nameResult = Path.GetFileName(f);
    const name = nameResult !== undefined ? nameResult.ToLowerInvariant() : "";
    if (name === "hugo.toml" || name === "hugo.yaml" || name === "hugo.yml" || name === "config.toml" || name === "config.yaml" || name === "config.yml") {
      baseFiles.Add(f);
    } else if (name === "params.toml" || name === "params.yaml" || name === "params.yml") {
      paramFiles.Add(f);
    } else if (name.StartsWith("languages.")) {
      langFiles.Add(f);
    } else if (name.StartsWith("menus.")) {
      menuFiles.Add(f);
    } else if (name === "module.toml") {
      moduleFiles.Add(f);
    } else {
      otherFiles.Add(f);
    }
  }

  // Process in order: base -> params -> languages -> menus -> module -> other
  const baseArr = baseFiles.ToArray();
  for (let i = 0; i < baseArr.Length; i++) sortedFiles.Add(baseArr[i]!);
  const paramArr = paramFiles.ToArray();
  for (let i = 0; i < paramArr.Length; i++) sortedFiles.Add(paramArr[i]!);
  const langArr = langFiles.ToArray();
  for (let i = 0; i < langArr.Length; i++) sortedFiles.Add(langArr[i]!);
  const menuArr = menuFiles.ToArray();
  for (let i = 0; i < menuArr.Length; i++) sortedFiles.Add(menuArr[i]!);
  const modArr = moduleFiles.ToArray();
  for (let i = 0; i < modArr.Length; i++) sortedFiles.Add(modArr[i]!);
  const otherArr = otherFiles.ToArray();
  for (let i = 0; i < otherArr.Length; i++) sortedFiles.Add(otherArr[i]!);

  const sorted = sortedFiles.ToArray();
  for (let i = 0; i < sorted.Length; i++) {
    const filePath = sorted[i]!;
    const fileNameResult = Path.GetFileName(filePath);
    const fileName = fileNameResult !== undefined ? fileNameResult.ToLowerInvariant() : "";
    const text = readTextFile(filePath);

    if (fileName === "module.toml") {
      // Parse module mounts
      const mounts = parseModuleToml(text);
      config.moduleMounts = mounts;
    } else if (fileName.EndsWith(".toml")) {
      config = mergeTomlIntoConfig(config, text, fileName);
    } else if (fileName.EndsWith(".yaml") || fileName.EndsWith(".yml")) {
      config = mergeYamlIntoConfig(config, text, fileName);
    }
    // Skip json for now as split configs are typically toml/yaml
  }

  return config;
};

export const loadSiteConfig = (siteDir: string): LoadedConfig => {
  // First check for split config directory
  const splitConfigDir = Path.Combine(siteDir, "config", "_default");
  if (dirExists(splitConfigDir)) {
    const config = loadSplitConfig(splitConfigDir);
    return new LoadedConfig(splitConfigDir, config);
  }

  // Fall back to single config file
  const candidates = [
    Path.Combine(siteDir, "hugo.toml"),
    Path.Combine(siteDir, "hugo.yaml"),
    Path.Combine(siteDir, "hugo.yml"),
    Path.Combine(siteDir, "hugo.json"),
    Path.Combine(siteDir, "config.toml"),
    Path.Combine(siteDir, "config.yaml"),
    Path.Combine(siteDir, "config.yml"),
    Path.Combine(siteDir, "config.json"),
  ];

  const path = tryGetFirstExisting(candidates);
  if (path === undefined) {
    const defaultConfig = new SiteConfig("Tsumo Site", "", "en-us", undefined);
    return new LoadedConfig(undefined, defaultConfig);
  }

  const text = readTextFile(path);
  const lower = path.ToLowerInvariant();
  const parsedConfig =
    lower.EndsWith(".toml") ? parseTomlConfig(text) : lower.EndsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, parsedConfig);
};
