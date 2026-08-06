import { attribute } from "@tsonic/core/lang.js";

import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { Exception } from "@tsonic/dotnet/System.js";

import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";

import { BuildRequest, TsumoError, buildSite, initSite, newContent } from "@tsumo/engine/index.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureScaffoldDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected a scaffold diagnostic");
};

export class ScaffoldAndBuildTests {
  scaffold_then_build(): void {
    const siteDir = createTestDirectory("site");
    const outDir = createTestDirectory("out");

    try {
      initSite(siteDir);

      const req = new BuildRequest(siteDir);
      req.destinationDir = outDir;
      req.cleanDestinationDir = true;

      const result = buildSite(req);

      Assert.True(Directory.Exists(outDir));
      Assert.True(File.Exists(Path.Combine(outDir, "index.html")));
      Assert.True(File.Exists(Path.Combine(outDir, "posts", "hello-world", "index.html")));
      Assert.Equal(12, result.pagesBuilt);
      Assert.Equal(13, Directory.GetFiles(outDir, "*", SearchOption.AllDirectories).length);
    } finally {
      deleteTestDirectory(outDir);
      deleteTestDirectory(siteDir);
    }
  }

  drafts_skipped_by_default(): void {
    const siteDir = createTestDirectory("site");
    const outDir = createTestDirectory("out");

    try {
      initSite(siteDir);
      newContent(siteDir, "posts/my-draft.md");

      const req = new BuildRequest(siteDir);
      req.destinationDir = outDir;
      req.cleanDestinationDir = true;
      req.buildDrafts = false;

      buildSite(req);

      Assert.True(!File.Exists(Path.Combine(outDir, "posts", "my-draft", "index.html")));
    } finally {
      deleteTestDirectory(outDir);
      deleteTestDirectory(siteDir);
    }
  }

  new_content_then_build(): void {
    const siteDir = createTestDirectory("site");
    const outDir = createTestDirectory("out");

    try {
      initSite(siteDir);
      newContent(siteDir, "posts/my-post.md");

      const req = new BuildRequest(siteDir);
      req.destinationDir = outDir;
      req.cleanDestinationDir = true;
      req.buildDrafts = true;

      buildSite(req);

      Assert.True(File.Exists(Path.Combine(outDir, "posts", "my-post", "index.html")));
    } finally {
      deleteTestDirectory(outDir);
      deleteTestDirectory(siteDir);
    }
  }

  scaffold_boundaries_fail_closed_with_exact_diagnostics(): void {
    const root = createTestDirectory("scaffold-boundaries");
    try {
      const occupied = Path.Combine(root, "occupied");
      Directory.CreateDirectory(occupied);
      File.WriteAllText(Path.Combine(occupied, "keep.txt"), "keep");
      Assert.Equal(
        "TSUMO_SCAFFOLD_DESTINATION_NOT_EMPTY",
        captureScaffoldDiagnostic(() => {
          initSite(occupied);
        }),
      );

      const site = Path.Combine(root, "site");
      initSite(site);
      Assert.Equal(
        "TSUMO_SCAFFOLD_CONTENT_PATH_ESCAPES_ROOT",
        captureScaffoldDiagnostic(() => {
          newContent(site, "../outside.md");
        }),
      );
      newContent(site, "posts/exact.md");
      Assert.Equal(
        "TSUMO_SCAFFOLD_CONTENT_EXISTS",
        captureScaffoldDiagnostic(() => {
          newContent(site, "posts/exact.md");
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<ScaffoldAndBuildTests>().method((target) => target.scaffold_then_build).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.drafts_skipped_by_default).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.new_content_then_build).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.scaffold_boundaries_fail_closed_with_exact_diagnostics).add(FactAttribute);
