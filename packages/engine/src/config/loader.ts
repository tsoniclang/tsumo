import { join, basename } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { createTsumoError } from "../diagnostics.js";
import { SiteConfig } from "../models.js";
import { readTextFile, dirExists, rejectFilesystemLink } from "../fs.js";
import { LoadedConfig } from "./loaded-config.js";
import { tryGetFirstExisting } from "./helpers.js";
import { parseTomlConfig, mergeTomlIntoConfig } from "./toml.js";
import { parseYamlConfig, mergeYamlIntoConfig } from "./yaml.js";
import { parseJsonConfig } from "./json.js";

const loadSplitConfig = (configDir: string): SiteConfig => {
  rejectFilesystemLink(configDir);
  let config = new SiteConfig("Tsumo Site", "", "en-us", undefined, undefined);
  const entries = readdirSync(configDir);
  const files: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const path = join(configDir, entries[i]!);
    rejectFilesystemLink(path);
    if (!statSync(path).isFile()) {
      throw createTsumoError("TSUMO_CONFIG_ENTRY_INVALID", `Split configuration entry is not a file: ${path}`, path);
    }
    files.push(path);
  }

  const sortedFiles: string[] = [];
  const baseFiles: string[] = [];
  const paramFiles: string[] = [];
  const langFiles: string[] = [];
  const menuFiles: string[] = [];
  const moduleFiles: string[] = [];
  const otherFiles: string[] = [];
  const fileNames = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]!;
    const name = basename(filePath).toLowerCase();
    if (fileNames.has(name)) {
      throw createTsumoError("TSUMO_CONFIG_FILE_AMBIGUOUS", `Split configuration file name '${name}' is not unique`, configDir);
    }
    fileNames.add(name);
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

  baseFiles.sort();
  paramFiles.sort();
  langFiles.sort();
  menuFiles.sort();
  moduleFiles.sort();
  otherFiles.sort();
  if (baseFiles.length > 1) {
    throw createTsumoError("TSUMO_CONFIG_FILE_AMBIGUOUS", "Split configuration accepts at most one base configuration file", configDir);
  }
  if (paramFiles.length > 1) {
    throw createTsumoError("TSUMO_CONFIG_FILE_AMBIGUOUS", "Split configuration accepts at most one params configuration file", configDir);
  }
  if (moduleFiles.length > 1) {
    throw createTsumoError("TSUMO_CONFIG_FILE_AMBIGUOUS", "Split configuration accepts at most one module configuration file", configDir);
  }
  let aggregateLanguageFiles = 0;
  for (let i = 0; i < langFiles.length; i++) {
    if (basename(langFiles[i]!).toLowerCase() === "languages.toml") aggregateLanguageFiles++;
  }
  if (aggregateLanguageFiles > 1) {
    throw createTsumoError("TSUMO_CONFIG_FILE_AMBIGUOUS", "Split configuration accepts at most one aggregate language configuration file", configDir);
  }
  for (let i = 0; i < baseFiles.length; i++) sortedFiles.push(baseFiles[i]!);
  for (let i = 0; i < paramFiles.length; i++) sortedFiles.push(paramFiles[i]!);
  for (let i = 0; i < langFiles.length; i++) {
    if (basename(langFiles[i]!).toLowerCase() === "languages.toml") sortedFiles.push(langFiles[i]!);
  }
  for (let i = 0; i < langFiles.length; i++) {
    if (basename(langFiles[i]!).toLowerCase() !== "languages.toml") sortedFiles.push(langFiles[i]!);
  }
  for (let i = 0; i < menuFiles.length; i++) sortedFiles.push(menuFiles[i]!);
  for (let i = 0; i < moduleFiles.length; i++) sortedFiles.push(moduleFiles[i]!);
  for (let i = 0; i < otherFiles.length; i++) sortedFiles.push(otherFiles[i]!);

  for (let i = 0; i < sortedFiles.length; i++) {
    const filePath = sortedFiles[i]!;
    const fileName = basename(filePath).toLowerCase();
    const text = readTextFile(filePath);

    if (fileName.endsWith(".toml")) {
      config = mergeTomlIntoConfig(config, text, fileName, filePath);
    } else if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
      config = mergeYamlIntoConfig(config, text, fileName, filePath);
    } else {
      throw createTsumoError("TSUMO_CONFIG_FILE_UNSUPPORTED", `Unsupported split configuration file '${fileName}'`, filePath);
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
    lower.endsWith(".toml") ? parseTomlConfig(text, path) : lower.endsWith(".json") ? parseJsonConfig(text, path) : parseYamlConfig(text, path);

  return new LoadedConfig(path, parsedConfig);
};
