import { attribute } from "@tsonic/core/lang.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import {
  TsumoError,
  createWatchSnapshot,
  listDirectoriesTopDirectory,
  listFilesRecursive,
  listFilesTopDirectory,
  watchSnapshotsEqual,
} from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureTsumoError = (operation: () => void): TsumoError => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error;
    throw error;
  }
  throw new Exception("Expected a Tsumo error");
};

export class FilesystemBoundaryTests {
  recursive_discovery_is_sorted_and_rejects_links(): void {
    const root = createTestDirectory("filesystem-discovery");
    try {
      const source = Path.Combine(root, "source");
      const nested = Path.Combine(source, "a");
      const outside = Path.Combine(root, "outside");
      Directory.CreateDirectory(nested);
      Directory.CreateDirectory(outside);
      File.WriteAllText(Path.Combine(source, "z.txt"), "z");
      File.WriteAllText(Path.Combine(nested, "b.txt"), "b");
      File.WriteAllText(Path.Combine(nested, "a.txt"), "a");
      File.WriteAllText(Path.Combine(outside, "outside.txt"), "outside");

      Assert.Equal([
        Path.Combine(nested, "a.txt"),
        Path.Combine(nested, "b.txt"),
        Path.Combine(source, "z.txt"),
      ], listFilesRecursive(source, "*.txt"));
      Assert.Equal([Path.Combine(source, "z.txt")], listFilesTopDirectory(source, "*.txt"));
      Assert.Equal([nested], listDirectoriesTopDirectory(source));

      const link = Path.Combine(source, "linked-directory");
      Directory.CreateSymbolicLink(link, outside);
      const error = captureTsumoError(() => {
        listFilesRecursive(source, "*");
      });
      Assert.Equal("TSUMO_FILESYSTEM_LINK_UNSUPPORTED", error.diagnostic.code);
      Assert.Equal(link, error.diagnostic.file);
    } finally {
      deleteTestDirectory(root);
    }
  }

  watch_snapshots_detect_file_changes_and_use_link_policy(): void {
    const root = createTestDirectory("watch-snapshot");
    try {
      const watched = Path.Combine(root, "watched");
      Directory.CreateDirectory(watched);
      const file = Path.Combine(watched, "page.md");
      File.WriteAllText(file, "before");

      const initial = createWatchSnapshot([watched]);
      Assert.True(watchSnapshotsEqual(initial, createWatchSnapshot([watched])));
      File.WriteAllText(file, "after with a different size");
      Assert.False(watchSnapshotsEqual(initial, createWatchSnapshot([watched])));

      const link = Path.Combine(watched, "linked-file.md");
      File.CreateSymbolicLink(link, file);
      Assert.Equal(
        "TSUMO_FILESYSTEM_LINK_UNSUPPORTED",
        captureTsumoError(() => {
          createWatchSnapshot([watched]);
        }).diagnostic.code,
      );
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<FilesystemBoundaryTests>().method((target) => target.recursive_discovery_is_sorted_and_rejects_links).add(FactAttribute);
attribute<FilesystemBoundaryTests>().method((target) => target.watch_snapshots_detect_file_changes_and_use_link_policy).add(FactAttribute);
