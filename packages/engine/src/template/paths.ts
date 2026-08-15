import { createTsumoError } from "../diagnostics.js";
import { replaceText, substringCount } from "../utils/strings.js";

export const normalizeTemplateRelativePath = (rawPath: string): string => {
  const normalized = replaceText(rawPath.trim(), "\\", "/");
  const driveQualified = normalized.length >= 2 && substringCount(normalized, 1, 1) === ":";
  if (normalized.startsWith("/") || driveQualified) {
    throw createTsumoError(
      "TSUMO_TEMPLATE_PATH_ABSOLUTE",
      `Template path must be layout-root relative: ${rawPath}`,
    );
  }

  const segments = normalized.split("/");
  const accepted: string[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw createTsumoError(
        "TSUMO_TEMPLATE_PATH_ESCAPES_ROOT",
        `Template path escapes its layout root: ${rawPath}`,
      );
    }
    if (segment.includes("\u0000")) {
      throw createTsumoError("TSUMO_TEMPLATE_PATH_INVALID", "Template path contains a null character");
    }
    accepted.push(segment);
  }
  return accepted.join("/");
};

const templateDirectory = (relativePath: string): string => {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash < 0 ? "" : substringCount(relativePath, 0, lastSlash);
};

const pushUnique = (values: string[], value: string): void => {
  for (let index = 0; index < values.length; index++) {
    if (values[index] === value) return;
  }
  values.push(value);
};

export const partialTemplateCandidates = (
  nameRaw: string,
  callerRelativePath: string | undefined,
): string[] => {
  const name = normalizeTemplateRelativePath(nameRaw);
  if (name === "") {
    throw createTsumoError("TSUMO_TEMPLATE_PARTIAL_NAME_EMPTY", "Template partial name cannot be empty");
  }

  const candidates: string[] = [];
  pushUnique(candidates, `partials/${name}`);
  pushUnique(candidates, `_partials/${name}`);

  if (callerRelativePath !== undefined) {
    const selectedCallerPath = callerRelativePath as string;
    const caller = normalizeTemplateRelativePath(selectedCallerPath);
    const directory = templateDirectory(caller);
    if (directory === "partials" || directory.startsWith("partials/") ||
        directory === "_partials" || directory.startsWith("_partials/")) {
      pushUnique(candidates, normalizeTemplateRelativePath(`${directory}/${name}`));
    }
  }
  return candidates;
};
