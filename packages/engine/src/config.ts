import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import { SiteConfig } from "./models.ts";
import { fileExists, readTextFile } from "./fs.ts";
import { ensureTrailingSlash } from "./utils/text.ts";

export class LoadedConfig {
  readonly path: string | undefined;
  readonly config: SiteConfig;

  constructor(path: string | undefined, config: SiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const tryGetFirstExisting = (paths: string[]): string | undefined => {
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]!;
    if (fileExists(p)) return p;
  }
  return undefined;
};

const unquote = (value: string): string => {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.substring(1, v.length - 2);
  }
  return v;
};

const parseTomlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let theme: string | undefined = undefined;
  const params = new Dictionary<string, string>();

  const lines = text.replace("\r\n", "\n").split("\n");

  let table = "";
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      table = line.substring(1, line.length - 2).trim().toLowerInvariant();
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.substring(0, eq).trim();
    const value = unquote(line.substring(eq + 1).trim());

    if (table === "params") {
      params.remove(key);
      params.add(key, value);
      continue;
    }

    const k = key.toLowerInvariant();
    if (k === "title") title = value;
    else if (k === "baseurl") baseURL = value;
    else if (k === "languagecode") languageCode = value;
    else if (k === "theme") theme = value;
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme);
  config.Params = params;
  return config;
};

const parseYamlConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let theme: string | undefined = undefined;
  const params = new Dictionary<string, string>();

  const lines = text.replace("\r\n", "\n").split("\n");

  let inParams = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (!raw.startsWith(" ")) inParams = false;

    if (!raw.startsWith(" ") && line.toLowerInvariant() === "params:") {
      inParams = true;
      continue;
    }

    if (inParams && raw.startsWith("  ") && line.contains(":")) {
      const idx = line.indexOf(":");
      const key = line.substring(0, idx).trim();
      const val = unquote(line.substring(idx + 1).trim());
      params.remove(key);
      params.add(key, val);
      continue;
    }

    if (!raw.startsWith(" ") && line.contains(":")) {
      const idx = line.indexOf(":");
      const key = line.substring(0, idx).trim().toLowerInvariant();
      const val = unquote(line.substring(idx + 1).trim());
      if (key === "title") title = val;
      else if (key === "baseurl") baseURL = val;
      else if (key === "languagecode") languageCode = val;
      else if (key === "theme") theme = val;
      continue;
    }
  }

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme);
  config.Params = params;
  return config;
};

const parseJsonConfig = (text: string): SiteConfig => {
  let title = "Tsumo Site";
  let baseURL = "";
  let languageCode = "en-us";
  let theme: string | undefined = undefined;
  const params = new Dictionary<string, string>();

  const doc = JsonDocument.parse(text);
  const root = doc.rootElement;

  if (root.valueKind === JsonValueKind.object_) {
    const props = root.enumerateObject().getEnumerator();
    while (props.moveNext()) {
      const p = props.current;
      const key = p.name.toLowerInvariant();
      const v = p.value;

      if (key === "title" && v.valueKind === JsonValueKind.string_) {
        title = v.getString() ?? title;
        continue;
      }
      if (key === "baseurl" && v.valueKind === JsonValueKind.string_) {
        baseURL = v.getString() ?? baseURL;
        continue;
      }
      if (key === "languagecode" && v.valueKind === JsonValueKind.string_) {
        languageCode = v.getString() ?? languageCode;
        continue;
      }
      if (key === "theme" && v.valueKind === JsonValueKind.string_) {
        theme = v.getString();
        continue;
      }
      if (key === "params" && v.valueKind === JsonValueKind.object_) {
        const pp = v.enumerateObject().getEnumerator();
        while (pp.moveNext()) {
          const prop = pp.current;
          const val = prop.value;
          if (val.valueKind === JsonValueKind.string_) {
            const s = val.getString();
            if (s !== undefined) {
              params.remove(prop.name);
              params.add(prop.name, s);
            }
          }
        }
      }
    }
  }

  doc.dispose();

  const config = new SiteConfig(title, ensureTrailingSlash(baseURL), languageCode, theme);
  config.Params = params;
  return config;
};

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
    const config = new SiteConfig("Tsumo Site", "", "en-us", undefined);
    return new LoadedConfig(undefined, config);
  }

  const text = readTextFile(path);
  const lower = path.toLowerInvariant();
  const config =
    lower.endsWith(".toml") ? parseTomlConfig(text) : lower.endsWith(".json") ? parseJsonConfig(text) : parseYamlConfig(text);

  return new LoadedConfig(path, config);
};
