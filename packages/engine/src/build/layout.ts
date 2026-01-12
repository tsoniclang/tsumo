import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { char } from "@tsonic/core/types.js";
import { LayoutEnvironment } from "../layouts.ts";
import { PageContext, SiteConfig } from "../models.ts";

export const combineUrl = (parts: string[]): string => {
  const slash: char = "/";
  const sb = new List<string>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!.trim();
    if (p !== "") sb.add(p.trimStart(slash).trimEnd(slash));
  }
  const arr = sb.toArray();
  let out = "/";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i]!;
    if (!out.endsWith("/")) out += "/";
  }
  return out === "//" ? "/" : out;
};

export const resolveThemeDir = (siteDir: string, config: SiteConfig, themesDir?: string): string | undefined => {
  if (config.theme === undefined) return undefined;
  const themeName = config.theme.trim();
  if (themeName === "") return undefined;
  const themesDirTrimmed = themesDir !== undefined ? themesDir.trim() : "";
  if (themesDirTrimmed !== "") {
    const themesBase = Path.isPathRooted(themesDirTrimmed) ? themesDirTrimmed : Path.combine(siteDir, themesDirTrimmed);
    const candidate = Path.combine(themesBase, themeName);
    if (Directory.exists(candidate)) return candidate;
  }

  const themeDir = Path.combine(siteDir, "themes", themeName);
  return Directory.exists(themeDir) ? themeDir : undefined;
};

export const selectTemplate = (env: LayoutEnvironment, candidates: string[]): string | undefined => {
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i]!;
    const t = env.getTemplate(p);
    if (t !== undefined) return p;
  }
  return undefined;
};

export const renderWithBase = (env: LayoutEnvironment, basePath: string | undefined, mainPath: string, ctx: PageContext): string => {
  const main = env.getTemplate(mainPath);
  if (main === undefined) return "";

  if (basePath !== undefined) {
    const base = env.getTemplate(basePath);
    if (base !== undefined && main.defines.count > 0) {
      return base.render(ctx, env, main.defines);
    }
  }

  return main.render(ctx, env);
};
