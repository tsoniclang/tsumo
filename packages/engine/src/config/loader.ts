import { join, basename } from "node:path";
import { readdirSync } from "node:fs";
import { SiteConfig } from "../models.js";
import { readTextFile, dirExists } from "../fs.js";
import { LoadedConfig } from "./loaded-config.js";
import { tryGetFirstExisting } from "./helpers.js";
import { parseTomlConfig, mergeTomlIntoConfig, parseModuleToml } from "./toml.js";
import { parseYamlConfig, mergeYamlIntoConfig } from "./yaml.js";
import { parseJsonConfig } from "./json.js";

const loadSplitConfig = (configDir: string): SiteConfig => {
  let config = new SiteConfig("Tsumo Site", "", "en-us", undefined, undefined);
  const entries = readdirSync(configDir);
  const files: string[] = [];
  for (let i = 0; i < entries.length; i++) files.push(join(configDir, entries[i]!));

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

  for (let i = 0; i < baseFiles.length; i++) sortedFiles.push(baseFiles[i]!);
  for (let i = 0; i < paramFiles.length; i++) sortedFiles.push(paramFiles[i]!);
  for (let i = 0; i < langFiles.length; i++) sortedFiles.push(langFiles[i]!);
  for (let i = 0; i < menuFiles.length; i++) sortedFiles.push(menuFiles[i]!);
  for (let i = 0; i < moduleFiles.length; i++) sortedFiles.push(moduleFiles[i]!);
  for (let i = 0; i < otherFiles.length; i++) sortedFiles.push(otherFiles[i]!);

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
    return new LoadedConfig(undefined, new SiteConfig("Tsumo Site", "", "en-us", undefined, undefined));
  }

  const text = readTextFile(path);
  const lower = path.toLowerCase();
  const parsedConfig =
    lower.endsWith(".toml") ? parseTomlConfig(text) : lower.endsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, parsedConfig);
};
