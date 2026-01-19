import { Dictionary, List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Directory, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { fileExists, readTextFile } from "./fs.ts";
import { indexOfText } from "./utils/strings.ts";

export class I18nStore {
  private readonly translations: Dictionary<string, Dictionary<string, string>>;

  constructor() {
    this.translations = new Dictionary<string, Dictionary<string, string>>();
  }

  loadFromDir(dir: string): void {
    if (!Directory.Exists(dir)) return;

    const files = Directory.GetFiles(dir, "*", SearchOption.TopDirectoryOnly);
    for (let i = 0; i < files.Length; i++) {
      const file = files[i]!;
      const ext = (Path.GetExtension(file) ?? "").ToLowerInvariant();
      if (ext !== ".yaml" && ext !== ".yml" && ext !== ".toml" && ext !== ".json") continue;

      const fileName = Path.GetFileNameWithoutExtension(file) ?? "";
      if (fileName === "") continue;

      const lang = fileName.ToLowerInvariant();
      const content = readTextFile(file);

      let langDict = new Dictionary<string, string>();
      const hasLang = this.translations.TryGetValue(lang, langDict);
      if (!hasLang) {
        langDict = new Dictionary<string, string>();
        this.translations.Remove(lang);
        this.translations.Add(lang, langDict);
      }

      if (ext === ".yaml" || ext === ".yml") {
        this.parseYamlI18n(content, langDict);
      } else if (ext === ".toml") {
        this.parseTomlI18n(content, langDict);
      } else if (ext === ".json") {
        this.parseJsonI18n(content, langDict);
      }
    }
  }

  private parseYamlI18n(content: string, dict: Dictionary<string, string>): void {
    const lines = content.ReplaceLineEndings("\n").Split("\n");
    let currentId = "";

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("- id:")) {
        const value = line.Substring("- id:".Length).Trim();
        currentId = this.unquoteYaml(value);
      } else if (line.StartsWith("id:")) {
        const value = line.Substring("id:".Length).Trim();
        currentId = this.unquoteYaml(value);
      } else if (line.StartsWith("translation:") && currentId !== "") {
        const value = line.Substring("translation:".Length).Trim();
        const translation = this.unquoteYaml(value);
        dict.Remove(currentId);
        dict.Add(currentId, translation);
        currentId = "";
      }
    }
  }

  private unquoteYaml(value: string): string {
    const trimmed = value.Trim();
    if (trimmed.StartsWith("'") && trimmed.EndsWith("'")) {
      return trimmed.Substring(1, trimmed.Length - 2);
    }
    if (trimmed.StartsWith("\"") && trimmed.EndsWith("\"")) {
      return trimmed.Substring(1, trimmed.Length - 2);
    }
    return trimmed;
  }

  private parseTomlI18n(content: string, dict: Dictionary<string, string>): void {
    const lines = content.ReplaceLineEndings("\n").Split("\n");
    let currentId = "";

    for (let i = 0; i < lines.Length; i++) {
      const raw = lines[i]!;
      const line = raw.Trim();
      if (line === "" || line.StartsWith("#")) continue;

      if (line.StartsWith("[") && line.EndsWith("]")) {
        currentId = line.Substring(1, line.Length - 2).Trim();
        continue;
      }

      const eq = indexOfText(line, "=");
      if (eq < 0) continue;

      const key = line.Substring(0, eq).Trim().ToLowerInvariant();
      const value = this.unquoteToml(line.Substring(eq + 1).Trim());

      if ((key === "other" || key === "translation") && currentId !== "") {
        dict.Remove(currentId);
        dict.Add(currentId, value);
      }
    }
  }

  private unquoteToml(value: string): string {
    const trimmed = value.Trim();
    if (trimmed.StartsWith("\"") && trimmed.EndsWith("\"")) {
      return trimmed.Substring(1, trimmed.Length - 2);
    }
    if (trimmed.StartsWith("'") && trimmed.EndsWith("'")) {
      return trimmed.Substring(1, trimmed.Length - 2);
    }
    return trimmed;
  }

  private parseJsonI18n(content: string, _dict: Dictionary<string, string>): void {
    // Simplified JSON parsing - not fully implemented
    // Hugo i18n JSON is typically same format as YAML array
  }

  translate(lang: string, key: string): string {
    let langDict = new Dictionary<string, string>();
    const langLower = lang.ToLowerInvariant();

    let hasLang = this.translations.TryGetValue(langLower, langDict);
    if (!hasLang) {
      const dashIdx = indexOfText(langLower, "-");
      if (dashIdx > 0) {
        const baseLang = langLower.Substring(0, dashIdx);
        hasLang = this.translations.TryGetValue(baseLang, langDict);
      }
    }

    if (!hasLang) {
      hasLang = this.translations.TryGetValue("en", langDict);
    }

    if (!hasLang) return key;

    let value = "";
    const hasKey = langDict.TryGetValue(key, value);
    return hasKey ? value : key;
  }
}
