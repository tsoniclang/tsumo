import { Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "./diagnostics.js";
import { listFilesTopDirectory, readTextFile } from "./fs.js";
import { parseTemplateDataText } from "./template/evaluation/structured-data.js";
import {
  AnyArrayValue,
  DictValue,
  StringValue,
  TemplateValue,
} from "./template/values.js";

const pluralVariantNames: string[] = ["zero", "one", "two", "few", "many", "other"];

const isPluralVariantName = (name: string): boolean => {
  const normalized = name.toLowerCase();
  for (let index: int32 = 0; index < pluralVariantNames.length; index++) {
    if (pluralVariantNames[index] === normalized) return true;
  }
  return false;
};

class I18nMessage {
  variants: Map<string, string>;

  constructor(variants: Map<string, string>) {
    this.variants = variants;
  }

  select(count: int32 | undefined): string {
    if (count !== undefined) {
      const exactName = count === 0 ? "zero" : count === 1 ? "one" : count === 2 ? "two" : "other";
      const exact = this.variants.get(exactName);
      if (exact !== undefined) return exact;
    }
    const other = this.variants.get("other");
    if (other !== undefined) return other;
    for (let index: int32 = 0; index < pluralVariantNames.length; index++) {
      const value = this.variants.get(pluralVariantNames[index]!);
      if (value !== undefined) return value;
    }
    throw createTsumoError("TSUMO_I18N_MESSAGE_EMPTY", "An internationalization message has no text variants");
  }
}

const i18nText = (value: TemplateValue, identity: string, sourcePath: string): string => {
  if (value instanceof StringValue) return value.value;
  throw createTsumoError(
    "TSUMO_I18N_MESSAGE_VALUE_INVALID",
    `Internationalization message '${identity}' must contain text values`,
    sourcePath,
  );
};

const messageFromValue = (
  value: TemplateValue,
  identity: string,
  sourcePath: string,
): I18nMessage | undefined => {
  if (value instanceof StringValue) {
    const variants = new Map<string, string>();
    variants.set("other", value.value);
    return new I18nMessage(variants);
  }
  if (!(value instanceof DictValue)) return undefined;
  const fields = value.value;
  const translation = fields.get("translation");
  if (translation !== undefined) return messageFromValue(translation, identity, sourcePath);

  const variants = new Map<string, string>();
  for (const key of fields.keys()) {
    if (!isPluralVariantName(key)) continue;
    const field = fields.get(key);
    if (field === undefined) {
      throw createTsumoError("TSUMO_I18N_MESSAGE_INCONSISTENT", `Internationalization variant '${identity}.${key}' disappeared`, sourcePath);
    }
    variants.set(key.toLowerCase(), i18nText(field, `${identity}.${key}`, sourcePath));
  }
  return variants.size === 0 ? undefined : new I18nMessage(variants);
};

const setLayerMessage = (
  layer: Map<string, I18nMessage>,
  identity: string,
  message: I18nMessage,
  sourcePath: string,
): void => {
  if (identity === "") {
    throw createTsumoError("TSUMO_I18N_MESSAGE_IDENTITY_INVALID", "Internationalization message identity cannot be empty", sourcePath);
  }
  if (layer.has(identity)) {
    throw createTsumoError(
      "TSUMO_I18N_MESSAGE_CONFLICT",
      `Internationalization message '${identity}' is declared more than once in the same layer`,
      sourcePath,
    );
  }
  layer.set(identity, message);
};

const collectMessageTree = (
  value: TemplateValue,
  identity: string,
  layer: Map<string, I18nMessage>,
  sourcePath: string,
): void => {
  const message = messageFromValue(value, identity, sourcePath);
  if (message !== undefined) {
    setLayerMessage(layer, identity, message, sourcePath);
    return;
  }
  if (!(value instanceof DictValue)) {
    throw createTsumoError(
      "TSUMO_I18N_MESSAGE_SHAPE_INVALID",
      `Internationalization value '${identity}' must be text or a message dictionary`,
      sourcePath,
    );
  }
  for (const key of value.value.keys()) {
    const child = value.value.get(key);
    if (child === undefined) {
      throw createTsumoError("TSUMO_I18N_MESSAGE_INCONSISTENT", `Internationalization value '${key}' disappeared`, sourcePath);
    }
    collectMessageTree(child, identity === "" ? key : `${identity}.${key}`, layer, sourcePath);
  }
};

const collectLegacyMessages = (
  values: AnyArrayValue,
  layer: Map<string, I18nMessage>,
  sourcePath: string,
): void => {
  for (let index: int32 = 0; index < values.value.length; index++) {
    const item = values.value[index]!;
    if (!(item instanceof DictValue)) {
      throw createTsumoError("TSUMO_I18N_MESSAGE_SHAPE_INVALID", "Internationalization message list entries must be dictionaries", sourcePath);
    }
    const identityValue = item.value.get("id");
    const translation = item.value.get("translation");
    if (!(identityValue instanceof StringValue) || translation === undefined) {
      throw createTsumoError("TSUMO_I18N_MESSAGE_SHAPE_INVALID", "Internationalization message list entries require text 'id' and 'translation' fields", sourcePath);
    }
    const message = messageFromValue(translation, identityValue.value, sourcePath);
    if (message === undefined) {
      throw createTsumoError("TSUMO_I18N_MESSAGE_SHAPE_INVALID", `Internationalization message '${identityValue.value}' has an invalid translation`, sourcePath);
    }
    setLayerMessage(layer, identityValue.value, message, sourcePath);
  }
};

const collectI18nFile = (
  content: string,
  format: string,
  sourcePath: string,
  layer: Map<string, I18nMessage>,
): void => {
  const value = parseTemplateDataText(content, format, sourcePath);
  if (value instanceof AnyArrayValue) {
    const legacyMessages: AnyArrayValue = value as AnyArrayValue;
    collectLegacyMessages(legacyMessages, layer, sourcePath);
  } else {
    collectMessageTree(value, "", layer, sourcePath);
  }
};

export class I18nStore {
  translations: Map<string, Map<string, I18nMessage>>;

  constructor() {
    this.translations = new Map<string, Map<string, I18nMessage>>();
  }

  loadFromDir(dir: string): void {
    const files = listFilesTopDirectory(dir, "*");
    files.sort();
    const layer = new Map<string, Map<string, I18nMessage>>();
    for (let index: int32 = 0; index < files.length; index++) {
      const file = files[index]!;
      const extension = (Path.GetExtension(file) ?? "").toLowerCase();
      let format = "";
      if (extension === ".yaml" || extension === ".yml") format = "yaml";
      else if (extension === ".toml") format = "toml";
      else if (extension === ".json") format = "json";
      else continue;
      const fileName = Path.GetFileNameWithoutExtension(file) ?? "";
      if (fileName === "") continue;
      const language = fileName.toLowerCase();
      let languageLayer = layer.get(language);
      if (languageLayer === undefined) {
        languageLayer = new Map<string, I18nMessage>();
        layer.set(language, languageLayer);
      }
      collectI18nFile(readTextFile(file), format, file, languageLayer);
    }
    for (const language of layer.keys()) {
      let selected = this.translations.get(language);
      if (selected === undefined) {
        selected = new Map<string, I18nMessage>();
        this.translations.set(language, selected);
      }
      const messages = layer.get(language);
      if (messages === undefined) {
        throw createTsumoError("TSUMO_I18N_LAYER_INCONSISTENT", `Internationalization layer '${language}' disappeared`, dir);
      }
      for (const identity of messages.keys()) {
        const message = messages.get(identity);
        if (message === undefined) {
          throw createTsumoError("TSUMO_I18N_LAYER_INCONSISTENT", `Internationalization message '${identity}' disappeared`, dir);
        }
        selected.set(identity, message);
      }
    }
  }

  translate(language: string, key: string, count?: int32): string {
    const normalized = language.toLowerCase();
    let messages = this.translations.get(normalized);
    const separator = normalized.indexOf("-");
    if (messages === undefined && separator > 0) messages = this.translations.get(normalized.slice(0, separator));
    if (messages === undefined) messages = this.translations.get("en");
    if (messages === undefined) return key;
    const message = messages.get(key);
    return message === undefined ? key : message.select(count);
  }
}
