import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { attribute } from "@tsonic/core/lang.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";

import {
  createStringResource,
  fingerprintResource,
  normalizeResourceRelativePath,
  parseImageDimensions,
  Resource,
  ResourceData,
  resourceGlobMatches,
  ResourceManager,
  TsumoError,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureResourceDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a resource diagnostic");
};

export class ResourcePipelineTests {
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
  }

  transform_identity_and_metadata_are_content_exact(): void {
    const first = createStringResource("style.css", "a {}");
    const second = createStringResource("style.css", "b {}");
    Assert.True(first.id !== second.id);

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
    const siteDir = Path.Combine(root, "site");
    const themeDir = Path.Combine(root, "theme");
    const outputDir = Path.Combine(root, "output");
    try {
      Directory.CreateDirectory(Path.Combine(siteDir, "assets"));
      Directory.CreateDirectory(Path.Combine(themeDir, "assets"));
      File.WriteAllText(Path.Combine(siteDir, "assets", "z.txt"), "site-z");
      File.WriteAllText(Path.Combine(siteDir, "assets", "a.txt"), "site-a");
      File.WriteAllText(Path.Combine(themeDir, "assets", "a.txt"), "theme-a");
      File.WriteAllText(Path.Combine(themeDir, "assets", "m.txt"), "theme-m");

      const manager = new ResourceManager(siteDir, themeDir, outputDir);
      const matched = manager.match("*.txt");
      Assert.Equal(3, matched.length);
      Assert.True(matched[0]!.outputRelPath === "a.txt");
      Assert.True(matched[1]!.outputRelPath === "m.txt");
      Assert.True(matched[2]!.outputRelPath === "z.txt");
      Assert.True(matched[0]!.text === "site-a");
      Assert.Equal(3, manager.byType("text").length);
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<ResourcePipelineTests>().method((target) => target.relative_path_policy_rejects_every_escape_form).add(FactAttribute);
attribute<ResourcePipelineTests>().method((target) => target.glob_matching_is_segment_exact).add(FactAttribute);
attribute<ResourcePipelineTests>().method((target) => target.image_dimensions_are_read_from_exact_file_signatures).add(FactAttribute);
attribute<ResourcePipelineTests>().method((target) => target.transform_identity_and_metadata_are_content_exact).add(FactAttribute);
attribute<ResourcePipelineTests>().method((target) => target.resource_lookup_is_sorted_and_site_assets_override_theme_assets).add(FactAttribute);
