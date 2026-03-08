import { join, basename } from "node:path";
import { readdirSync } from "node:fs";
import { SiteConfig } from "../models.ts";
import { readTextFile, dirExists } from "../fs.ts";
import { LoadedConfig } from "./loaded-config.ts";
import { tryGetFirstExisting } from "./helpers.ts";
import { parseTomlConfig, mergeTomlIntoConfig, parseModuleToml } from "./toml.ts";
import { parseYamlConfig, mergeYamlIntoConfig } from "./yaml.ts";
import { parseJsonConfig } from "./json.ts";

const loadSplitConfig = (configDir: string): SiteConfig => {
  let config = new SiteConfig("Tsumo Site", "", "en-us", undefined);
  const files = readdirSync(configDir).map((entry) => join(configDir, entry));

  const sortedFiles: string[] = [];
  const baseFiles: string[] = [];
  const paramFiles: string[] = [];
  const langFiles: string[] = [];
  const menuFiles: string[] = [];
  const moduleFiles: string[] = [];
  const otherFiles: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]!;
    const name = basename(filePath).toLowerCase();
    if (name === "hugo.toml" || name === "hugo.yaml" || name === "hugo.yml" || name === "config.toml" || name === "config.yaml" || name === "config.yml") {
      baseFiles.push(filePath);
    } else if (name === "params.toml" || name === "params.yaml" || name === "params.yml") {
      paramFiles.push(filePath);
    } else if (name.startsWith("languages.")) {
      langFiles.push(filePath);
    } else if (name.startsWith("menus.")) {
      menuFiles.push(filePath);
    } else if (name === "module.toml") {
      moduleFiles.push(filePath);
    } else {
      otherFiles.push(filePath);
    }
  }

  sortedFiles.push(...baseFiles, ...paramFiles, ...langFiles, ...menuFiles, ...moduleFiles, ...otherFiles);

  for (let i = 0; i < sortedFiles.length; i++) {
    const filePath = sortedFiles[i]!;
    const fileName = basename(filePath).toLowerCase();
    const text = readTextFile(filePath);

    if (fileName === "module.toml") {
      config.moduleMounts = parseModuleToml(text);
    } else if (fileName.endsWith(".toml")) {
      config = mergeTomlIntoConfig(config, text, fileName);
    } else if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
      config = mergeYamlIntoConfig(config, text, fileName);
    }
  }

  return config;
};

export const loadSiteConfig = (siteDir: string): LoadedConfig => {
  const splitConfigDir = join(siteDir, "config", "_default");
  if (dirExists(splitConfigDir)) {
    return new LoadedConfig(splitConfigDir, loadSplitConfig(splitConfigDir));
  }

  const candidates = [
    join(siteDir, "hugo.toml"),
    join(siteDir, "hugo.yaml"),
    join(siteDir, "hugo.yml"),
    join(siteDir, "hugo.json"),
    join(siteDir, "config.toml"),
    join(siteDir, "config.yaml"),
    join(siteDir, "config.yml"),
    join(siteDir, "config.json"),
  ];

  const path = tryGetFirstExisting(candidates);
  if (path === undefined) {
    return new LoadedConfig(undefined, new SiteConfig("Tsumo Site", "", "en-us", undefined));
  }

  const text = readTextFile(path);
  const lower = path.toLowerCase();
  const parsedConfig =
    lower.endsWith(".toml") ? parseTomlConfig(text) : lower.endsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, parsedConfig);
};
