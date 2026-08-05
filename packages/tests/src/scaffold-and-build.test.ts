import { attribute } from "@tsonic/core/lang.js";

import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import { Directory, File, Path, SearchOption } from "@tsonic/dotnet/System.IO.js";
import { Environment, Exception, Guid } from "@tsonic/dotnet/System.js";

import { BuildRequest, buildSite, initSite, newContent } from "@tsumo/engine/index.js";

const createTempDir = (name: string): string => {
  const configuredRoot = Environment.GetEnvironmentVariable("TSUMO_TEST_ROOT");
  if (configuredRoot === undefined || configuredRoot.trim() === "") {
    throw new Exception("TSUMO_TEST_ROOT must name the test-owned scratch directory");
  }
  const root = Path.GetFullPath(configuredRoot);
  Directory.CreateDirectory(root);

  const dir = Path.Combine(root, `${name}-${Guid.NewGuid().ToString("n")}`);
  return dir;
};

const deleteIfExists = (path: string): void => {
  if (Directory.Exists(path)) Directory.Delete(path, true);
};

export class ScaffoldAndBuildTests {
  scaffold_then_build(): void {
    const siteDir = createTempDir("site");
    const outDir = createTempDir("out");

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
      deleteIfExists(outDir);
      deleteIfExists(siteDir);
    }
  }

  drafts_skipped_by_default(): void {
    const siteDir = createTempDir("site");
    const outDir = createTempDir("out");

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
      deleteIfExists(outDir);
      deleteIfExists(siteDir);
    }
  }

  new_content_then_build(): void {
    const siteDir = createTempDir("site");
    const outDir = createTempDir("out");

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
      deleteIfExists(outDir);
      deleteIfExists(siteDir);
    }
  }
}

attribute<ScaffoldAndBuildTests>().method((target) => target.scaffold_then_build).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.drafts_skipped_by_default).add(FactAttribute);
attribute<ScaffoldAndBuildTests>().method((target) => target.new_content_then_build).add(FactAttribute);
