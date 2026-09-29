import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import {
  createStringResource,
  fingerprintResource,
  normalizeResourceRelativePath,
  parseImageDimensions,
  isValidUtf8,
  readResourceText,
  Resource,
  ResourceData,
  resourceGlobMatches,
  ResourceManager,
  runExternalProcess,
  TsumoError,
} from "@tsumo/engine/testing.js";
import { createDirectory, createTestDirectory, deleteTestDirectory, writeTextFile } from "./test-root.js";

const captureResourceDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Error("Expected a resource diagnostic");
};

export class ResourcePipelineTests {
  missing_external_tool_preserves_the_requested_diagnostic(): void {
    Assert.Equal("TSUMO_TEST_TOOL_START_FAILED", captureResourceDiagnostic(() => {
      runExternalProcess("__tsumo_missing_external_tool__", [], "test tool", "TSUMO_TEST_TOOL_START_FAILED");
    }));
  }

  relative_path_policy_rejects_every_escape_form(): void {
    Assert.Equal(
      "TSUMO_RESOURCE_PATH_ESCAPES_ROOT",
      captureResourceDiagnostic(() => {
        normalizeResourceRelativePath("../secret.txt");
      }),
    );
    Assert.Equal(
      "TSUMO_RESOURCE_PATH_ESCAPES_ROOT",
      captureResourceDiagnostic(() => {
        normalizeResourceRelativePath("assets/../../secret.txt");
      }),
    );
    Assert.Equal(
      "TSUMO_RESOURCE_PATH_ABSOLUTE",
      captureResourceDiagnostic(() => {
        normalizeResourceRelativePath("C:\\secret.txt");
      }),
    );
    Assert.Equal("images/logo.png", normalizeResourceRelativePath("/images/./logo.png"));
  }

  glob_matching_is_segment_exact(): void {
    Assert.True(resourceGlobMatches("images/**/*.png", "images/icons/logo.png"));
    Assert.True(resourceGlobMatches("*.css", "site.css"));
    Assert.True(resourceGlobMatches("{*cover*,*thumbnail*}", "article-cover.png"));
    Assert.True(resourceGlobMatches("{*cover*,*thumbnail*}", "article-thumbnail.png"));
    Assert.True(!resourceGlobMatches("{*cover*,*thumbnail*}", "article-logo.png"));
    Assert.True(!resourceGlobMatches("*.css", "nested/site.css"));
    Assert.True(!resourceGlobMatches("images/*.png", "images/icons/logo.png"));
  }

  image_dimensions_are_read_from_exact_file_signatures(): void {
    const png = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 2, 0, 0, 0, 3,
    ]);
    const dimensions = parseImageDimensions(png);
    Assert.True(dimensions !== undefined && dimensions.width === 2 && dimensions.height === 3);
    Assert.True(parseImageDimensions(Buffer.from([1, 2, 3])) === undefined);

    const images = [
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 44, 0, 0, 3, 232]),
      Buffer.from([71, 73, 70, 56, 57, 97, 44, 1, 232, 3]),
      Buffer.from([255, 216, 255, 192, 0, 8, 8, 3, 232, 1, 44, 3]),
      Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 44, 1, 232, 3]),
      Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 76, 0, 0, 0, 0, 47, 43, 193, 249, 0]),
    ];
    for (const image of images) {
      const measured = parseImageDimensions(image);
      Assert.True(measured !== undefined && measured.width === 300 && measured.height === 1000);
    }
    const oversized = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 128, 0, 0, 0, 0, 0, 0, 1]);
    Assert.True(parseImageDimensions(oversized) === undefined);
  }

  utf8_validation_accepts_scalars_and_rejects_malformed_sequences(): void {
    Assert.True(isValidUtf8(Buffer.from([
      0x41,
      0xc2, 0xa2,
      0xe2, 0x82, 0xac,
      0xf0, 0x9f, 0x98, 0x80,
    ])));
    const malformed = [
      Buffer.from([0x80]),
      Buffer.from([0xc0, 0x80]),
      Buffer.from([0xe0, 0x80, 0x80]),
      Buffer.from([0xed, 0xa0, 0x80]),
      Buffer.from([0xf4, 0x90, 0x80, 0x80]),
      Buffer.from([0xf0, 0x9f, 0x92]),
    ];
    for (let index = 0; index < malformed.length; index++) {
      Assert.True(!isValidUtf8(malformed[index]!));
    }
  }

  file_resources_publish_raw_bytes_and_decode_only_for_text_operations(): void {
    const root = createTestDirectory("resource-bytes");
    const siteDir = join(root, "site");
    const outputDir = join(root, "output");
    try {
      const assetsDir = join(siteDir, "assets");
      createDirectory(assetsDir);
      const sourceBytes = Buffer.from([0x61, 0xa0, 0x62]);
      writeFileSync(join(assetsDir, "legacy.js"), sourceBytes);
      const manager = new ResourceManager(siteDir, undefined, outputDir);
      const resource = manager.get("legacy.js");
      Assert.True(resource !== undefined && resource.text === undefined);
      if (resource === undefined) throw new Error("Expected legacy.js resource");
      manager.ensurePublished(resource);
      const published = readFileSync(join(outputDir, "legacy.js"));
      Assert.Equal(3, published.length);
      Assert.Equal(0xa0, published.readUInt8(1));
      Assert.Equal(
        "TSUMO_RESOURCE_TEXT_ENCODING_INVALID",
        captureResourceDiagnostic(() => {
          readResourceText(resource, "Resource.Content");
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }

  transform_identity_and_metadata_are_content_exact(): void {
    const first = createStringResource("style.css", "a {}");
    const second = createStringResource("style.css", "b {}");
    Assert.True(first.id !== second.id);
    Assert.True(first.publishable);
    Assert.Equal("style.css", first.outputRelPath);
    Assert.Equal("text/css", first.mediaType);

    const source = new Resource(
      "source",
      undefined,
      true,
      "css/site.css",
      Buffer.from("body {}", "utf8"),
      "body {}",
      new ResourceData(""),
      "text/css",
      10,
      20,
    );
    const fingerprinted = fingerprintResource(source);
    Assert.Equal("text/css", fingerprinted.mediaType);
    Assert.Equal(10, fingerprinted.width);
    Assert.Equal(20, fingerprinted.height);
    const expectedHash = createHash("sha256").update(source.bytes).digest("hex").slice(0, 16);
    Assert.True(fingerprinted.outputRelPath === `css/site.${expectedHash}.css`);
    Assert.True(fingerprinted.Data.Integrity.startsWith("sha256-"));
  }

  resource_lookup_is_sorted_and_site_assets_override_theme_assets(): void {
    const root = createTestDirectory("resources");
    const siteDir = join(root, "site");
    const themeDir = join(root, "theme");
    const outputDir = join(root, "output");
    try {
      createDirectory(join(siteDir, "assets"));
      createDirectory(join(themeDir, "assets"));
      writeTextFile(join(siteDir, "assets", "z.txt"), "site-z");
      writeTextFile(join(siteDir, "assets", "a.txt"), "site-a");
      writeTextFile(join(siteDir, "assets", "main.ts"), "export const value = 1;");
      writeTextFile(join(themeDir, "assets", "a.txt"), "theme-a");
      writeTextFile(join(themeDir, "assets", "m.txt"), "theme-m");

      const manager = new ResourceManager(siteDir, themeDir, outputDir);
      const matched = manager.match("*.txt");
      Assert.Equal(3, matched.length);
      Assert.True(matched[0]!.outputRelPath === "a.txt");
      Assert.True(matched[1]!.outputRelPath === "m.txt");
      Assert.True(matched[2]!.outputRelPath === "z.txt");
      Assert.True(matched[0]!.text === undefined);
      Assert.Equal("site-a", readResourceText(matched[0]!, "test"));
      Assert.Equal(4, manager.byType("text").length);
      const typescript = manager.get("main.ts");
      Assert.True(typescript !== undefined && typescript.text === undefined);
      Assert.True(typescript !== undefined && readResourceText(typescript, "test") === "export const value = 1;");
      Assert.True(typescript !== undefined && typescript.mediaType === "text/typescript");
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<ResourcePipelineTests>().method((target) => target.relative_path_policy_rejects_every_escape_form).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.missing_external_tool_preserves_the_requested_diagnostic).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.glob_matching_is_segment_exact).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.image_dimensions_are_read_from_exact_file_signatures).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.utf8_validation_accepts_scalars_and_rejects_malformed_sequences).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.file_resources_publish_raw_bytes_and_decode_only_for_text_operations).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.transform_identity_and_metadata_are_content_exact).add(() => new FactAttribute());
attribute<ResourcePipelineTests>().method((target) => target.resource_lookup_is_sorted_and_site_assets_override_theme_assets).add(() => new FactAttribute());
