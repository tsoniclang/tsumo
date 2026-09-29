import { attribute } from "@tsonic/core/lang.js";
import { join } from "node:path";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";

import {
  TsumoError,
  WatchEntryState,
  createWatchSnapshot,
  listDirectoriesTopDirectory,
  listFilesRecursive,
  listFilesTopDirectory,
  watchSnapshotsEqual,
} from "@tsumo/engine/testing.js";
import {
  createDirectory,
  createSymbolicLink,
  createTestDirectory,
  deleteTestDirectory,
  writeTextFile,
} from "./test-root.js";

const captureTsumoError = (operation: () => void): TsumoError => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error;
    throw error;
  }
  throw new Error("Expected a Tsumo error");
};

export class FilesystemBoundaryTests {
  watch_snapshot_sizes_preserve_adjacent_native_integers(): void {
    const first = new Map<string, WatchEntryState>();
    const same = new Map<string, WatchEntryState>();
    const next = new Map<string, WatchEntryState>();
    first.set("large", new WatchEntryState(123.5, 9007199254740992));
    same.set("large", new WatchEntryState(123.5, 9007199254740992));
    const adjacent = new WatchEntryState(123.5, 9007199254740992);
    adjacent.size++;
    next.set("large", adjacent);
    Assert.True(watchSnapshotsEqual(first, same));
    Assert.False(watchSnapshotsEqual(first, next));
    same.set("large", new WatchEntryState(123.75, 9007199254740992));
    Assert.False(watchSnapshotsEqual(first, same));
  }

  recursive_discovery_is_sorted_and_rejects_links(): void {
    const root = createTestDirectory("filesystem-discovery");
    try {
      const source = join(root, "source");
      const nested = join(source, "a");
      const outside = join(root, "outside");
      createDirectory(nested);
      createDirectory(outside);
      writeTextFile(join(source, "z.txt"), "z");
      writeTextFile(join(nested, "b.txt"), "b");
      writeTextFile(join(nested, "a.txt"), "a");
      writeTextFile(join(outside, "outside.txt"), "outside");

      Assert.Equal([
        join(nested, "a.txt"),
        join(nested, "b.txt"),
        join(source, "z.txt"),
      ], listFilesRecursive(source, "*.txt"));
      Assert.Equal([join(source, "z.txt")], listFilesTopDirectory(source, "*.txt"));
      Assert.Equal([nested], listDirectoriesTopDirectory(source));

      const link = join(source, "linked-directory");
      createSymbolicLink(outside, link);
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
      const watched = join(root, "watched");
      createDirectory(watched);
      const file = join(watched, "page.md");
      writeTextFile(file, "before");

      const initial = createWatchSnapshot([watched]);
      Assert.True(watchSnapshotsEqual(initial, createWatchSnapshot([watched])));
      writeTextFile(file, "after with a different size");
      Assert.False(watchSnapshotsEqual(initial, createWatchSnapshot([watched])));

      const link = join(watched, "linked-file.md");
      createSymbolicLink(file, link);
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

attribute<FilesystemBoundaryTests>().method((target) => target.recursive_discovery_is_sorted_and_rejects_links).add(() => new FactAttribute());
attribute<FilesystemBoundaryTests>().method((target) => target.watch_snapshot_sizes_preserve_adjacent_native_integers).add(() => new FactAttribute());
attribute<FilesystemBoundaryTests>().method((target) => target.watch_snapshots_detect_file_changes_and_use_link_policy).add(() => new FactAttribute());
