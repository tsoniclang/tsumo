import { attribute } from "@tsonic/core/lang.js";

import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";

import { BuildRequest, buildSite, initSite, newContent } from "@tsumo/engine/index.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

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
}

attribute<ScaffoldAndBuildTests>().method((target) => target.scaffold_then_build).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.drafts_skipped_by_default).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.new_content_then_build).add(FactAttribute);
