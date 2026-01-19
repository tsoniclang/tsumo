import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import type { char } from "@tsonic/core/types.js";
import { LayoutEnvironment } from "../layouts.ts";
import { PageContext, SiteConfig } from "../models.ts";

export const combineUrl = (parts: string[]): string => {
  const slash: char = "/";
  const sb = new List<string>();
  for (let i = 0; i < parts.Length; i++) {
    const p = parts[i]!.Trim();
    if (p !== "") sb.Add(p.TrimStart(slash).TrimEnd(slash));
  }
  const arr = sb.ToArray();
  let out = "/";
  for (let i = 0; i < arr.Length; i++) {
    out += arr[i]!;
    if (!out.EndsWith("/")) out += "/";
  }
  return out === "//" ? "/" : out;
};

export const resolveThemeDir = (siteDir: string, config: SiteConfig, themesDir?: string): string | undefined => {
  if (config.theme === undefined) return undefined;
  const themeName = config.theme.Trim();
  if (themeName === "") return undefined;
  const themesDirTrimmed = themesDir !== undefined ? themesDir.Trim() : "";
  if (themesDirTrimmed !== "") {
    const themesBase = Path.IsPathRooted(themesDirTrimmed) ? themesDirTrimmed : Path.Combine(siteDir, themesDirTrimmed);
    const candidate = Path.Combine(themesBase, themeName);
    if (Directory.Exists(candidate)) return candidate;
  }

  const themeDir = Path.Combine(siteDir, "themes", themeName);
  return Directory.Exists(themeDir) ? themeDir : undefined;
};

export const selectTemplate = (env: LayoutEnvironment, candidates: string[]): string | undefined => {
  for (let i = 0; i < candidates.Length; i++) {
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
    if (base !== undefined) {
      // Always use base template when it exists - main.defines provides overrides
      // The base template has its own block definitions for defaults
      return base.render(ctx, env, main.defines);
    }
  }

  return main.render(ctx, env);
};
