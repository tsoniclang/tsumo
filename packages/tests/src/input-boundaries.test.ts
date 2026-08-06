import { attribute } from "@tsonic/core/lang.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import {
  JsonObject,
  JsonString,
  TsumoDiagnostic,
  TsumoError,
  contentTypeForPath,
  loadSiteConfig,
  parseContent,
  parseJson,
  parseJsonConfig,
  parseTomlConfig,
  parseYamlConfig,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureDiagnostic = (operation: () => void): TsumoDiagnostic => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic;
    throw error;
  }
  throw new Exception("Expected a Tsumo diagnostic");
};

const assertFrontMatterModel = (source: string): void => {
  const parsed = parseContent(source, "content/post.md");
  Assert.Equal("Café 🚀", parsed.frontMatter.title);
  Assert.True(parsed.frontMatter.date !== undefined);
  Assert.True(!parsed.frontMatter.draft);
  Assert.Equal(2, parsed.frontMatter.tags.length);
  Assert.Equal("alpha", parsed.frontMatter.tags[0]);
  Assert.Equal("beta", parsed.frontMatter.tags[1]);
  const featured = parsed.frontMatter.Params.get("featured");
  Assert.True(featured !== undefined && featured.boolValue);
  Assert.Equal(1, parsed.frontMatter.menus.length);
  Assert.Equal("main", parsed.frontMatter.menus[0]!.menu);
  Assert.Equal(2, parsed.frontMatter.menus[0]!.weight);
  Assert.Equal("Body", parsed.body);
};

const assertConfigModel = (title: string, baseURL: string, featured: boolean, menuName: string): void => {
  Assert.Equal("Café", title);
  Assert.Equal("https://example.test/", baseURL);
  Assert.True(featured);
  Assert.Equal("Home", menuName);
};

export class InputBoundaryTests {
  json_tree_preserves_unicode_kinds_and_source_locations(): void {
    const value = parseJson("{\n  \"title\": \"Caf\\u00e9 \\ud83d\\ude80\"\n}", "config.json");
    Assert.True(value instanceof JsonObject);
    if (!(value instanceof JsonObject)) throw new Exception("Expected JSON object");
    const title = value.get("title");
    Assert.True(title instanceof JsonString);
    if (!(title instanceof JsonString)) throw new Exception("Expected JSON string");
    Assert.Equal("Café 🚀", title.value);
    Assert.Equal(2, title.line);
    Assert.Equal(12, title.column);
  }

  json_tree_rejects_ambiguous_and_malformed_inputs_exactly(): void {
    const leadingZero = captureDiagnostic(() => {
      parseJson("{\n  \"value\": 01\n}", "bad.json");
    });
    Assert.Equal("TSUMO_JSON_SYNTAX_INVALID", leadingZero.code);
    Assert.Equal("bad.json", leadingZero.file);
    Assert.Equal(2, leadingZero.line);
    Assert.Equal(13, leadingZero.column);

    const duplicate = captureDiagnostic(() => {
      parseJson("{\n  \"value\": 1,\n  \"value\": 2\n}", "duplicate.json");
    });
    Assert.Equal("TSUMO_JSON_DUPLICATE_PROPERTY", duplicate.code);
    Assert.Equal(3, duplicate.line);
    Assert.Equal(3, duplicate.column);

    Assert.Equal(
      "TSUMO_JSON_SYNTAX_INVALID",
      captureDiagnostic(() => {
        parseJson("{\"value\": \"\\ud800\"}", "surrogate.json");
      }).code,
    );

    let deeplyNested = "";
    for (let index = 0; index < 257; index++) deeplyNested += "[";
    for (let index = 0; index < 257; index++) deeplyNested += "]";
    Assert.Equal(
      "TSUMO_JSON_DEPTH_EXCEEDED",
      captureDiagnostic(() => {
        parseJson(deeplyNested, "deep.json");
      }).code,
    );
  }

  all_front_matter_formats_create_one_closed_model(): void {
    assertFrontMatterModel([
      "---",
      "title: 'Café 🚀'",
      "date: '2026-01-02T00:00:00Z'",
      "draft: false",
      "tags: ['alpha', 'beta']",
      "params:",
      "  featured: true",
      "menu:",
      "  main:",
      "    name: Home",
      "    weight: 2",
      "---",
      "Body",
    ].join("\n"));

    assertFrontMatterModel([
      "+++",
      "title = 'Café 🚀'",
      "date = '2026-01-02T00:00:00Z'",
      "draft = false",
      "tags = ['alpha', 'beta']",
      "[params]",
      "featured = true",
      "[[menu.main]]",
      "name = 'Home'",
      "weight = 2",
      "+++",
      "Body",
    ].join("\n"));

    assertFrontMatterModel([
      "{",
      "  \"title\": \"Caf\\u00e9 \\ud83d\\ude80\",",
      "  \"date\": \"2026-01-02T00:00:00Z\",",
      "  \"draft\": false,",
      "  \"tags\": [\"alpha\", \"beta\"],",
      "  \"params\": { \"featured\": true },",
      "  \"menu\": { \"main\": { \"name\": \"Home\", \"weight\": 2 } }",
      "}",
      "Body",
    ].join("\n"));
  }

  front_matter_rejects_invalid_shapes_with_exact_locations(): void {
    const invalidDate = captureDiagnostic(() => {
      parseContent("---\ndate: not-a-date\n---\nBody", "date.md");
    });
    Assert.Equal("TSUMO_FRONTMATTER_INVALID_DATE", invalidDate.code);
    Assert.Equal("date.md", invalidDate.file);
    Assert.Equal(2, invalidDate.line);

    Assert.Equal(
      "TSUMO_FRONTMATTER_INVALID_BOOL",
      captureDiagnostic(() => {
        parseContent("+++\ndraft = 'false'\n+++", "draft.md");
      }).code,
    );
    Assert.Equal(
      "TSUMO_FRONTMATTER_FIELD_INVALID",
      captureDiagnostic(() => {
        parseContent("{\"tags\": [\"ok\", 1]}", "tags.md");
      }).code,
    );
    Assert.Equal(
      "TSUMO_FRONTMATTER_FIELD_DUPLICATE",
      captureDiagnostic(() => {
        parseContent("---\ntitle: First\nTitle: Second\n---", "duplicate.md");
      }).code,
    );
    Assert.Equal(
      "TSUMO_FRONTMATTER_DELIMITER_UNCLOSED",
      captureDiagnostic(() => {
        parseContent("---\ntitle: Missing", "unclosed.md");
      }).code,
    );
  }

  all_configuration_formats_create_one_closed_model(): void {
    const toml = parseTomlConfig([
      "title = 'Café'",
      "baseURL = 'https://example.test'",
      "[params]",
      "featured = true",
      "[[menu.main]]",
      "name = 'Home'",
    ].join("\n"), "hugo.toml");
    const yaml = parseYamlConfig([
      "title: Café",
      "baseURL: https://example.test",
      "params:",
      "  featured: true",
      "menu:",
      "  main:",
      "    - name: Home",
    ].join("\n"), "hugo.yaml");
    const json = parseJsonConfig("{\"title\":\"Caf\\u00e9\",\"baseURL\":\"https://example.test\",\"params\":{\"featured\":true},\"menu\":{\"main\":[{\"name\":\"Home\"}]}}", "hugo.json");

    const tomlFeatured = toml.Params.get("featured");
    const yamlFeatured = yaml.Params.get("featured");
    const jsonFeatured = json.Params.get("featured");
    const tomlMenu = toml.Menus.get("main");
    const yamlMenu = yaml.Menus.get("main");
    const jsonMenu = json.Menus.get("main");
    Assert.True(tomlMenu !== undefined && yamlMenu !== undefined && jsonMenu !== undefined);
    if (tomlMenu === undefined || yamlMenu === undefined || jsonMenu === undefined) throw new Exception("Expected main menus");
    assertConfigModel(toml.title, toml.baseURL, tomlFeatured !== undefined && tomlFeatured.boolValue, tomlMenu[0]!.name);
    assertConfigModel(yaml.title, yaml.baseURL, yamlFeatured !== undefined && yamlFeatured.boolValue, yamlMenu[0]!.name);
    assertConfigModel(json.title, json.baseURL, jsonFeatured !== undefined && jsonFeatured.boolValue, jsonMenu[0]!.name);
  }

  configuration_rejects_unknown_malformed_and_mistyped_fields(): void {
    const json = captureDiagnostic(() => {
      parseJsonConfig("{\n  \"title\": 42\n}", "hugo.json");
    });
    Assert.Equal("TSUMO_CONFIG_INVALID_FIELD", json.code);
    Assert.Equal(2, json.line);

    Assert.Equal(
      "TSUMO_CONFIG_UNKNOWN_FIELD",
      captureDiagnostic(() => {
        parseYamlConfig("unsupported: value", "hugo.yaml");
      }).code,
    );
    Assert.Equal(
      "TSUMO_CONFIG_INVALID_FIELD",
      captureDiagnostic(() => {
        parseYamlConfig("title: true", "typed.yaml");
      }).code,
    );
    Assert.Equal(
      "TSUMO_CONFIG_DUPLICATE_FIELD",
      captureDiagnostic(() => {
        parseYamlConfig("title: First\nTitle: Second", "duplicate.yaml");
      }).code,
    );
    Assert.Equal(
      "TSUMO_CONFIG_INVALID_FIELD",
      captureDiagnostic(() => {
        parseTomlConfig("title = 42", "typed.toml");
      }).code,
    );
    Assert.Equal(
      "TSUMO_CONFIG_TABLE_UNSUPPORTED",
      captureDiagnostic(() => {
        parseTomlConfig("[unsupported]\nvalue = 1", "hugo.toml");
      }).code,
    );
    Assert.Equal(
      "TSUMO_CONFIG_SYNTAX_INVALID",
      captureDiagnostic(() => {
        parseTomlConfig("title = bare", "bare.toml");
      }).code,
    );
  }

  structured_scalars_decode_strings_and_comments(): void {
    const toml = parseTomlConfig([
      "title = \"Caf\\u00e9 # retained\" # removed",
      "[params]",
      "message = 'literal # retained' # removed",
      "count = 1_024",
    ].join("\n"), "scalars.toml");
    Assert.Equal("Café # retained", toml.title);
    Assert.Equal("literal # retained", toml.Params.get("message")?.stringValue);
    Assert.Equal(1024, toml.Params.get("count")?.numberValue);

    const yaml = parseYamlConfig([
      "title: \"Caf\\u00e9 # retained\" # removed",
      "copyright: 'Tsumo''s docs' # removed",
      "params:",
      "  address: value#fragment # removed",
    ].join("\n"), "scalars.yaml");
    Assert.Equal("Café # retained", yaml.title);
    Assert.Equal("Tsumo's docs", yaml.copyright);
    Assert.Equal("value#fragment", yaml.Params.get("address")?.stringValue);

    const frontMatter = parseContent("---\ntitle: 'Tsumo''s \\u263a' # removed\n---\nBody", "frontmatter.md");
    Assert.Equal("Tsumo's \\u263a", frontMatter.frontMatter.title);

    const leadingJson = " \n{\"title\":\"Not front matter\"}";
    const content = parseContent(leadingJson, "leading-json.md");
    Assert.True(content.frontMatter.title === undefined);
    Assert.Equal(leadingJson, content.body);
  }

  split_configuration_has_one_deterministic_merge_contract(): void {
    const site = createTestDirectory("split-config");
    try {
      const configDir = Path.Combine(site, "config", "_default");
      Directory.CreateDirectory(configDir);
      File.WriteAllText(Path.Combine(configDir, "hugo.toml"), "title = 'Example'\nbaseURL = 'https://example.test'");
      File.WriteAllText(Path.Combine(configDir, "params.yaml"), "message: \"Hello # retained\" # removed");
      File.WriteAllText(Path.Combine(configDir, "languages.toml"), [
        "[en]",
        "languageName = 'English'",
        "languageDirection = 'rtl'",
        "contentDir = 'content/custom'",
        "weight = 4",
      ].join("\n"));
      File.WriteAllText(Path.Combine(configDir, "languages.en.toml"), "weight = 1");
      File.WriteAllText(Path.Combine(configDir, "module.toml"), [
        "[[mounts]]",
        "source = 'shared'",
        "target = 'content'",
      ].join("\n"));

      const loaded = loadSiteConfig(site).config;
      Assert.Equal("Example", loaded.title);
      Assert.Equal("https://example.test/", loaded.baseURL);
      Assert.Equal("Hello # retained", loaded.Params.get("message")?.stringValue);
      Assert.Equal(1, loaded.languages.length);
      Assert.Equal("English", loaded.languages[0]!.languageName);
      Assert.Equal("rtl", loaded.languages[0]!.languageDirection);
      Assert.Equal("content/custom", loaded.languages[0]!.contentDir);
      Assert.Equal(1, loaded.languages[0]!.weight);
      Assert.Equal(1, loaded.moduleMounts.length);
      Assert.Equal("shared", loaded.moduleMounts[0]!.source);

      File.WriteAllText(Path.Combine(configDir, "params.yaml"), "message: first\nMessage: second");
      Assert.Equal("TSUMO_CONFIG_DUPLICATE_FIELD", captureDiagnostic(() => {
        loadSiteConfig(site);
      }).code);
      File.WriteAllText(Path.Combine(configDir, "params.yaml"), "message: first");
      File.WriteAllText(Path.Combine(configDir, "config.yaml"), "title: Other");
      Assert.Equal("TSUMO_CONFIG_FILE_AMBIGUOUS", captureDiagnostic(() => {
        loadSiteConfig(site);
      }).code);
    } finally {
      deleteTestDirectory(site);
    }
  }

  content_types_are_exact_and_fail_to_binary_by_default(): void {
    Assert.Equal("text/html; charset=utf-8", contentTypeForPath("INDEX.HTML"));
    Assert.Equal("application/json; charset=utf-8", contentTypeForPath("data.json"));
    Assert.Equal("image/png", contentTypeForPath("image.png"));
    Assert.Equal("font/woff2", contentTypeForPath("font.woff2"));
    Assert.Equal("application/octet-stream", contentTypeForPath("archive.unknown"));
  }
}

attribute<InputBoundaryTests>().method((target) => target.json_tree_preserves_unicode_kinds_and_source_locations).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.json_tree_rejects_ambiguous_and_malformed_inputs_exactly).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.all_front_matter_formats_create_one_closed_model).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.front_matter_rejects_invalid_shapes_with_exact_locations).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.all_configuration_formats_create_one_closed_model).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.configuration_rejects_unknown_malformed_and_mistyped_fields).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.structured_scalars_decode_strings_and_comments).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.split_configuration_has_one_deterministic_merge_contract).add(FactAttribute);
attribute<InputBoundaryTests>().method((target) => target.content_types_are_exact_and_fail_to_binary_by_default).add(FactAttribute);
