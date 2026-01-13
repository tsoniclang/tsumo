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
  const files = Directory.getFiles(configDir);

  // Sort files to process base config first, then params, then languages/menus
  const sortedFiles = new List<string>();
  const baseFiles = new List<string>();
  const paramFiles = new List<string>();
  const langFiles = new List<string>();
  const menuFiles = new List<string>();
  const moduleFiles = new List<string>();
  const otherFiles = new List<string>();

  for (let i = 0; i < files.length; i++) {
    const f = files[i]!;
    const nameResult = Path.getFileName(f);
    const name = nameResult !== undefined ? nameResult.toLowerInvariant() : "";
    if (name === "hugo.toml" || name === "hugo.yaml" || name === "hugo.yml" || name === "config.toml" || name === "config.yaml" || name === "config.yml") {
      baseFiles.add(f);
    } else if (name === "params.toml" || name === "params.yaml" || name === "params.yml") {
      paramFiles.add(f);
    } else if (name.startsWith("languages.")) {
      langFiles.add(f);
    } else if (name.startsWith("menus.")) {
      menuFiles.add(f);
    } else if (name === "module.toml") {
      moduleFiles.add(f);
    } else {
      otherFiles.add(f);
    }
  }

  // Process in order: base -> params -> languages -> menus -> module -> other
  const baseArr = baseFiles.toArray();
  for (let i = 0; i < baseArr.length; i++) sortedFiles.add(baseArr[i]!);
  const paramArr = paramFiles.toArray();
  for (let i = 0; i < paramArr.length; i++) sortedFiles.add(paramArr[i]!);
  const langArr = langFiles.toArray();
  for (let i = 0; i < langArr.length; i++) sortedFiles.add(langArr[i]!);
  const menuArr = menuFiles.toArray();
  for (let i = 0; i < menuArr.length; i++) sortedFiles.add(menuArr[i]!);
  const modArr = moduleFiles.toArray();
  for (let i = 0; i < modArr.length; i++) sortedFiles.add(modArr[i]!);
  const otherArr = otherFiles.toArray();
  for (let i = 0; i < otherArr.length; i++) sortedFiles.add(otherArr[i]!);

  const sorted = sortedFiles.toArray();
  for (let i = 0; i < sorted.length; i++) {
    const filePath = sorted[i]!;
    const fileNameResult = Path.getFileName(filePath);
    const fileName = fileNameResult !== undefined ? fileNameResult.toLowerInvariant() : "";
    const text = readTextFile(filePath);

    if (fileName === "module.toml") {
      // Parse module mounts
      const mounts = parseModuleToml(text);
      config.moduleMounts = mounts;
    } else if (fileName.endsWith(".toml")) {
      config = mergeTomlIntoConfig(config, text, fileName);
    } else if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
      config = mergeYamlIntoConfig(config, text, fileName);
    }
    // Skip json for now as split configs are typically toml/yaml
  }

  return config;
};

export const loadSiteConfig = (siteDir: string): LoadedConfig => {
  // First check for split config directory
  const splitConfigDir = Path.combine(siteDir, "config", "_default");
  if (dirExists(splitConfigDir)) {
    const config = loadSplitConfig(splitConfigDir);
    return new LoadedConfig(splitConfigDir, config);
  }

  // Fall back to single config file
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
