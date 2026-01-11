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
    if (!Directory.exists(dir)) return;

    const files = Directory.getFiles(dir, "*", SearchOption.topDirectoryOnly);
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const ext = (Path.getExtension(file) ?? "").toLowerInvariant();
      if (ext !== ".yaml" && ext !== ".yml" && ext !== ".toml" && ext !== ".json") continue;

      const fileName = Path.getFileNameWithoutExtension(file) ?? "";
      if (fileName === "") continue;

      const lang = fileName.toLowerInvariant();
      const content = readTextFile(file);

      let langDict = new Dictionary<string, string>();
      const hasLang = this.translations.tryGetValue(lang, langDict);
      if (!hasLang) {
        langDict = new Dictionary<string, string>();
        this.translations.remove(lang);
        this.translations.add(lang, langDict);
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
    const lines = content.replaceLineEndings("\n").split("\n");
    let currentId = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("- id:")) {
        const value = line.substring("- id:".length).trim();
        currentId = this.unquoteYaml(value);
      } else if (line.startsWith("id:")) {
        const value = line.substring("id:".length).trim();
        currentId = this.unquoteYaml(value);
      } else if (line.startsWith("translation:") && currentId !== "") {
        const value = line.substring("translation:".length).trim();
        const translation = this.unquoteYaml(value);
        dict.remove(currentId);
        dict.add(currentId, translation);
        currentId = "";
      }
    }
  }

  private unquoteYaml(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.substring(1, trimmed.length - 2);
    }
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return trimmed.substring(1, trimmed.length - 2);
    }
    return trimmed;
  }

  private parseTomlI18n(content: string, dict: Dictionary<string, string>): void {
    const lines = content.replaceLineEndings("\n").split("\n");
    let currentId = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]")) {
        currentId = line.substring(1, line.length - 2).trim();
        continue;
      }

      const eq = indexOfText(line, "=");
      if (eq < 0) continue;

      const key = line.substring(0, eq).trim().toLowerInvariant();
      const value = this.unquoteToml(line.substring(eq + 1).trim());

      if ((key === "other" || key === "translation") && currentId !== "") {
        dict.remove(currentId);
        dict.add(currentId, value);
      }
    }
  }

  private unquoteToml(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return trimmed.substring(1, trimmed.length - 2);
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.substring(1, trimmed.length - 2);
    }
    return trimmed;
  }

  private parseJsonI18n(content: string, _dict: Dictionary<string, string>): void {
    // Simplified JSON parsing - not fully implemented
    // Hugo i18n JSON is typically same format as YAML array
  }

  translate(lang: string, key: string): string {
    let langDict = new Dictionary<string, string>();
    const langLower = lang.toLowerInvariant();

    let hasLang = this.translations.tryGetValue(langLower, langDict);
    if (!hasLang) {
      const dashIdx = indexOfText(langLower, "-");
      if (dashIdx > 0) {
        const baseLang = langLower.substring(0, dashIdx);
        hasLang = this.translations.tryGetValue(baseLang, langDict);
      }
    }

    if (!hasLang) {
      hasLang = this.translations.tryGetValue("en", langDict);
    }

    if (!hasLang) return key;

    let value = "";
    const hasKey = langDict.tryGetValue(key, value);
    return hasKey ? value : key;
  }
}
