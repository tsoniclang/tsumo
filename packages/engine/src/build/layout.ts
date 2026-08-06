import { isAbsolute, join } from "node:path";
import { dirExists } from "../fs.js";
import { LayoutEnvironment } from "../layouts.js";
import { PageContext, SiteConfig } from "../models.js";
import { trimEndChar, trimStartChar } from "../utils/strings.js";

export const combineUrl = (parts: string[]): string => {
  const slash = "/";
  const cleaned = parts
    .map((part: string) => trimEndChar(trimStartChar(part.trim(), slash), slash))
    .filter((part: string) => part !== "");

  if (cleaned.length === 0) return "/";
  return "/" + cleaned.join("/") + "/";
};

export const resolveThemeDir = (siteDir: string, config: SiteConfig, themesDirRaw: string | undefined): string | undefined => {
  const configTheme = config.theme;
  if (configTheme === undefined) return undefined;
  const themeName = configTheme.trim();
  if (themeName === "") return undefined;

  const themesDir = themesDirRaw;
  const customThemesDir = themesDir !== undefined ? themesDir.trim() : "";
  if (customThemesDir !== "") {
    const themesBase = isAbsolute(customThemesDir) ? customThemesDir : join(siteDir, customThemesDir);
    const candidate = join(themesBase, themeName);
    if (dirExists(candidate)) return candidate;
  }

  const themeDir = join(siteDir, "themes", themeName);
  return dirExists(themeDir) ? themeDir : undefined;
};

export const selectTemplate = (env: LayoutEnvironment, candidates: string[]): string | undefined => {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    if (env.getTemplate(candidate) !== undefined) return candidate;
  }
  return undefined;
};

export const renderWithBase = (env: LayoutEnvironment, basePathRaw: string | undefined, mainPath: string, ctx: PageContext): string => {
  const main = env.getTemplate(mainPath);
  if (main === undefined) return "";

  const basePath = basePathRaw;
  if (basePath !== undefined) {
    const base = env.getTemplate(basePath);
    if (base !== undefined) {
      return base.render(ctx, env, main.defines);
    }
  }

  return main.render(ctx, env);
};
