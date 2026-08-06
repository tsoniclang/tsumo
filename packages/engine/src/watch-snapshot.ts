import { statSync } from "node:fs";
import { dirExists, fileExists, listFilesRecursive, rejectFilesystemLink } from "./fs.js";

export class WatchEntryState {
  modifiedAt: number;
  size: number;

  constructor(modifiedAt: number, size: number) {
    this.modifiedAt = modifiedAt;
    this.size = size;
  }
}

const addFileState = (snapshot: Map<string, WatchEntryState>, path: string): void => {
  rejectFilesystemLink(path);
  const stats = statSync(path);
  snapshot.set(path, new WatchEntryState(stats.mtimeMs, stats.size));
};

export const createWatchSnapshot = (targets: string[]): Map<string, WatchEntryState> => {
  const snapshot = new Map<string, WatchEntryState>();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    if (fileExists(target)) {
      addFileState(snapshot, target);
      continue;
    }
    if (!dirExists(target)) continue;

    const files = listFilesRecursive(target, "*");
    for (let j = 0; j < files.length; j++) addFileState(snapshot, files[j]!);
  }

  return snapshot;
};

export const watchSnapshotsEqual = (
  left: Map<string, WatchEntryState>,
  right: Map<string, WatchEntryState>,
): boolean => {
  if (left.size !== right.size) return false;
  for (const filePath of left.keys()) {
    const state = left.get(filePath);
    const other = right.get(filePath);
    if (
      state === undefined ||
      other === undefined ||
      state.modifiedAt !== other.modifiedAt ||
      state.size !== other.size
    ) return false;
  }
  return true;
};
