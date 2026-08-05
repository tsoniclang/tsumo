import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { Exception } from "@tsonic/dotnet/System.js";

import { copyDirRecursive, dirExists, ensureDir, fileExists } from "./fs.js";
import { pathContainsOrEquals } from "./utils/paths.js";

export class OutputPublication {
  destinationDir: string;
  stagingDir: string;
  backupDir: string;

  constructor(destinationDir: string, stagingDir: string, backupDir: string) {
    this.destinationDir = destinationDir;
    this.stagingDir = stagingDir;
    this.backupDir = backupDir;
  }

  publish(): void {
    let previousOutputMoved = false;
    if (dirExists(this.destinationDir)) {
      renameSync(this.destinationDir, this.backupDir);
      previousOutputMoved = true;
    }

    try {
      renameSync(this.stagingDir, this.destinationDir);
    } catch (error) {
      if (previousOutputMoved && !existsSync(this.destinationDir)) {
        renameSync(this.backupDir, this.destinationDir);
      }
      throw error;
    }
  }
}

export const beginOutputPublication = (
  siteDir: string,
  requestedDestinationDir: string,
  preserveExistingOutput: boolean,
): OutputPublication => {
  const siteRoot = resolve(siteDir);
  const destinationDir = isAbsolute(requestedDestinationDir)
    ? resolve(requestedDestinationDir)
    : resolve(siteRoot, requestedDestinationDir);

  if (!isAbsolute(requestedDestinationDir) && !pathContainsOrEquals(siteRoot, destinationDir)) {
    throw new Exception(`Relative output directory escapes the site root: ${requestedDestinationDir}`);
  }
  if (pathContainsOrEquals(destinationDir, siteRoot)) {
    throw new Exception(`Output directory cannot contain the source site: ${destinationDir}`);
  }

  const parent = dirname(destinationDir);
  if (parent === destinationDir) {
    throw new Exception(`Output directory cannot be a filesystem root: ${destinationDir}`);
  }
  if (fileExists(destinationDir)) {
    throw new Exception(`Output directory path names an existing file: ${destinationDir}`);
  }

  ensureDir(parent);
  const key = createHash("sha256").update(destinationDir).digest("hex").slice(0, 24);
  const scratchPrefix = `.tsumo-output-${key}`;
  const backupDir = resolve(parent, `${scratchPrefix}.backup`);
  const stagePrefix = resolve(parent, `${scratchPrefix}.stage-`);

  recoverOutputPublication(destinationDir, backupDir, parent, `${scratchPrefix}.stage-`);

  const stagingDir = mkdtempSync(stagePrefix);
  if (preserveExistingOutput && dirExists(destinationDir)) {
    copyDirRecursive(destinationDir, stagingDir);
  }
  return new OutputPublication(destinationDir, stagingDir, backupDir);
};

const recoverOutputPublication = (
  destinationDir: string,
  backupDir: string,
  parentDir: string,
  stageNamePrefix: string,
): void => {
  if (fileExists(backupDir)) {
    throw new Exception(`Output publication backup path names an existing file: ${backupDir}`);
  }
  if (dirExists(backupDir)) {
    if (dirExists(destinationDir)) {
      rmSync(backupDir, true);
    } else {
      renameSync(backupDir, destinationDir);
    }
  }

  const entries = readdirSync(parentDir);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.startsWith(stageNamePrefix)) {
      rmSync(resolve(parentDir, entry), true);
    }
  }
};
