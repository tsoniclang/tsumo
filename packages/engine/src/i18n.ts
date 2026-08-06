import { Path } from "@tsonic/dotnet/System.IO.js";
import { listFilesTopDirectory, readTextFile } from "./fs.js";
import { indexOfText, replaceLineEndings, substringCount, substringFrom } from "./utils/strings.js";

export class I18nStore {
  translations: Map<string, Map<string, string>>;

  constructor() {
    this.translations = new Map<string, Map<string, string>>();
  }

  loadFromDir(dir: string): void {
    const files = listFilesTopDirectory(dir, "*");
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const ext = (Path.GetExtension(file) ?? "").toLowerCase();
      if (ext !== ".yaml" && ext !== ".yml" && ext !== ".toml" && ext !== ".json") continue;

      const fileName = Path.GetFileNameWithoutExtension(file) ?? "";
      if (fileName === "") continue;

      const lang = fileName.toLowerCase();
      const content = readTextFile(file);

      let langDict = this.translations.get(lang);
      if (langDict === undefined) {
        langDict = new Map<string, string>();
        this.translations.set(lang, langDict);
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

  parseYamlI18n(content: string, dict: Map<string, string>): void {
    const lines = replaceLineEndings(content, "\n").split("\n");
    let currentId = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("- id:")) {
        const value = substringFrom(line, "- id:".length).trim();
        currentId = this.unquoteYaml(value);
      } else if (line.startsWith("id:")) {
        const value = substringFrom(line, "id:".length).trim();
        currentId = this.unquoteYaml(value);
      } else if (line.startsWith("translation:") && currentId !== "") {
        const value = substringFrom(line, "translation:".length).trim();
        const translation = this.unquoteYaml(value);
        dict.set(currentId, translation);
        currentId = "";
      }
    }
  }

  unquoteYaml(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return substringCount(trimmed, 1, trimmed.length - 2);
    }
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return substringCount(trimmed, 1, trimmed.length - 2);
    }
    return trimmed;
  }

  parseTomlI18n(content: string, dict: Map<string, string>): void {
    const lines = replaceLineEndings(content, "\n").split("\n");
    let currentId = "";

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) continue;

      if (line.startsWith("[") && line.endsWith("]")) {
        currentId = substringCount(line, 1, line.length - 2).trim();
        continue;
      }

      const eq = indexOfText(line, "=");
      if (eq < 0) continue;

      const key = substringCount(line, 0, eq).trim().toLowerCase();
      const value = this.unquoteToml(substringFrom(line, eq + 1).trim());

      if ((key === "other" || key === "translation") && currentId !== "") {
        dict.set(currentId, value);
      }
    }
  }

  unquoteToml(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
      return substringCount(trimmed, 1, trimmed.length - 2);
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return substringCount(trimmed, 1, trimmed.length - 2);
    }
    return trimmed;
  }

  parseJsonI18n(content: string, _dict: Map<string, string>): void {
    // Simplified JSON parsing - not fully implemented
    // Hugo i18n JSON is typically same format as YAML array
  }

  translate(lang: string, key: string): string {
    const langLower = lang.toLowerCase();

    let langDict = this.translations.get(langLower);
    if (langDict === undefined) {
      const dashIdx = indexOfText(langLower, "-");
      if (dashIdx > 0) {
        const baseLang = substringCount(langLower, 0, dashIdx);
        langDict = this.translations.get(baseLang);
      }
    }

    if (langDict === undefined) {
      langDict = this.translations.get("en");
    }

    if (langDict === undefined) return key;

    const value = langDict.get(key);
    return value !== undefined ? value : key;
  }
}
