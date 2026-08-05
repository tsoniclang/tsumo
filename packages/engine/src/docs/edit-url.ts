import { DocsMountConfig } from "./models.js";
import { trimEndChar, trimStartChar } from "../utils/strings.js";

export const createDocsEditUrl = (mount: DocsMountConfig, relativePath: string): string | undefined => {
  const repoUrl = mount.repoUrl;
  if (repoUrl === undefined) return undefined;
  const repository = trimEndChar(repoUrl.trim(), "/");
  if (repository === "") return undefined;

  const branch = mount.repoBranch.trim() === "" ? "main" : mount.repoBranch.trim();
  const sourcePath = trimStartChar(relativePath, "/");
  const configuredRepoPath = mount.repoPath;
  if (configuredRepoPath === undefined || configuredRepoPath.trim() === "") {
    return `${repository}/blob/${branch}/${sourcePath}`;
  }
  const repoPath = trimEndChar(trimStartChar(configuredRepoPath.trim(), "/"), "/");
  return `${repository}/blob/${branch}/${repoPath}/${sourcePath}`;
};
