import { attributes as A } from "@tsonic/core/attributes.js";

import { Assert, FactAttribute } from "xunit-types/Xunit.js";

import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Guid } from "@tsonic/dotnet/System.js";

import { BuildRequest } from "../build.ts";
import { buildSite } from "../build-site.ts";
import { initSite } from "../scaffold/init-site.ts";
import { newContent } from "../scaffold/new-content.ts";

const createTempDir = (name: string): string => {
  const root = Path.Combine(Path.GetTempPath(), "tsumo-tests");
  Directory.CreateDirectory(root);

  const dir = Path.Combine(root, `${name}-${Guid.NewGuid().ToString("n")}`);
  return dir;
};

const deleteIfExists = (path: string): void => {
  if (Directory.Exists(path)) Directory.Delete(path, true);
};

export class ScaffoldAndBuildTests {
  public scaffold_then_build(): void {
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
      Assert.True(result.pagesBuilt > 0);
    } finally {
      deleteIfExists(outDir);
      deleteIfExists(siteDir);
    }
  }

  public drafts_skipped_by_default(): void {
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

  public new_content_then_build(): void {
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

A.on(ScaffoldAndBuildTests).method((t) => t.scaffold_then_build).add(FactAttribute);
A.on(ScaffoldAndBuildTests).method((t) => t.drafts_skipped_by_default).add(FactAttribute);
A.on(ScaffoldAndBuildTests).method((t) => t.new_content_then_build).add(FactAttribute);
