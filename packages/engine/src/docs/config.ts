import { Exception } from "@tsonic/dotnet/System.js";
import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
import { Path } from "@tsonic/dotnet/System.IO.js";
import { JsonDocument, JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
import type { char } from "@tsonic/core/types.js";
import { fileExists, readTextFile } from "../fs.ts";
import { DocsMountConfig, DocsSiteConfig } from "./models.ts";
import { ensureLeadingSlash, ensureTrailingSlash } from "../utils/text.ts";

export class LoadedDocsConfig {
  readonly path: string;
  readonly config: DocsSiteConfig;

  constructor(path: string, config: DocsSiteConfig) {
    this.path = path;
    this.config = config;
  }
}

const readString = (doc: JsonDocument, propName: string): string | undefined => {
  const root = doc.RootElement;
  if (root.ValueKind !== JsonValueKind.Object) return undefined;
  const propNameLower = propName.ToLowerInvariant();
  const props = root.EnumerateObject().GetEnumerator();
  while (props.MoveNext()) {
    const p = props.Current;
    if (p.Name.ToLowerInvariant() === propNameLower) {
      if (p.Value.ValueKind === JsonValueKind.String) return p.Value.GetString();
      return undefined;
    }
  }
  return undefined;
};

const readBool = (doc: JsonDocument, propName: string): boolean | undefined => {
  const root = doc.RootElement;
  if (root.ValueKind !== JsonValueKind.Object) return undefined;
  const propNameLower = propName.ToLowerInvariant();
  const props = root.EnumerateObject().GetEnumerator();
  while (props.MoveNext()) {
    const p = props.Current;
    if (p.Name.ToLowerInvariant() !== propNameLower) continue;
    if (p.Value.ValueKind === JsonValueKind.True) return true;
    if (p.Value.ValueKind === JsonValueKind.False) return false;
    return undefined;
  }
  return undefined;
};

const normalizePrefix = (raw: string): string => {
  const p = ensureLeadingSlash(raw.Trim());
  return ensureTrailingSlash(p);
};

const resolveSourceDir = (siteDir: string, raw: string): string => {
  if (raw.Trim() === "") throw new Exception("Docs mount `source` cannot be empty");
  return Path.IsPathRooted(raw) ? Path.GetFullPath(raw) : Path.GetFullPath(Path.Combine(siteDir, raw));
};

const parseMounts = (siteDir: string, doc: JsonDocument): DocsMountConfig[] => {
  const empty: DocsMountConfig[] = [];
  const root = doc.RootElement;
  if (root.ValueKind !== JsonValueKind.Object) return empty;

  const props = root.EnumerateObject().GetEnumerator();
  while (props.MoveNext()) {
    const p = props.Current;
    if (p.Name.ToLowerInvariant() !== "mounts") continue;
    if (p.Value.ValueKind !== JsonValueKind.Array) return empty;

    const mounts = new List<DocsMountConfig>();
    const it = p.Value.EnumerateArray().GetEnumerator();
    while (it.MoveNext()) {
      const el = it.Current;
      if (el.ValueKind !== JsonValueKind.Object) continue;

      let name: string | undefined = undefined;
      let source: string | undefined = undefined;
      let prefix: string | undefined = undefined;
      let repoUrl: string | undefined = undefined;
      let repoBranch = "main";
      let repoPath: string | undefined = undefined;
      let navPath: string | undefined = undefined;

      const mp = el.EnumerateObject().GetEnumerator();
      while (mp.MoveNext()) {
        const prop = mp.Current;
        const key = prop.Name.ToLowerInvariant();
        const v = prop.Value;

        if (key === "name" && v.ValueKind === JsonValueKind.String) name = v.GetString();
        else if (key === "source" && v.ValueKind === JsonValueKind.String) source = v.GetString();
        else if (key === "prefix" && v.ValueKind === JsonValueKind.String) prefix = v.GetString();
        else if ((key === "repo" || key === "repourl") && v.ValueKind === JsonValueKind.String) repoUrl = v.GetString();
        else if ((key === "branch" || key === "repobranch") && v.ValueKind === JsonValueKind.String) repoBranch = v.GetString() ?? repoBranch;
        else if ((key === "repopath" || key === "subdir") && v.ValueKind === JsonValueKind.String) repoPath = v.GetString();
        else if ((key === "nav" || key === "navpath") && v.ValueKind === JsonValueKind.String) navPath = v.GetString();
      }

      if (source === undefined || prefix === undefined) continue;
      const sourceDir = resolveSourceDir(siteDir, source);
      const urlPrefix = normalizePrefix(prefix);
      const slash: char = "/";
      let mountName = name;
      if (mountName === undefined) {
        mountName = urlPrefix === "/" ? "Docs" : urlPrefix.TrimStart(slash).TrimEnd(slash);
      } else if (mountName.Trim() === "") {
        mountName = urlPrefix === "/" ? "Docs" : urlPrefix.TrimStart(slash).TrimEnd(slash);
      }

      let finalRepoPath = repoPath;
      if (finalRepoPath === undefined && repoUrl !== undefined) {
        finalRepoPath = Path.GetFileName(sourceDir);
      }

      mounts.Add(new DocsMountConfig(mountName, sourceDir, urlPrefix, repoUrl, repoBranch, finalRepoPath, navPath));
    }

    return mounts.ToArray();
  }

  return empty;
};

export const loadDocsConfig = (siteDir: string): LoadedDocsConfig | undefined => {
  const candidate = Path.Combine(siteDir, "tsumo.docs.json");
  if (!fileExists(candidate)) return undefined;

  const text = readTextFile(candidate);
  const doc = JsonDocument.Parse(text);

  const mounts = parseMounts(siteDir, doc);
  const strictLinks = readBool(doc, "strictLinks") ?? false;
  const generateSearchIndex = readBool(doc, "search") ?? true;
  const searchIndexFileName = readString(doc, "searchFile") ?? "search.json";
  const homeMount = readString(doc, "homeMount");
  const siteName = readString(doc, "siteName") ?? "Docs";

  doc.Dispose();

  if (mounts.Length === 0) throw new Exception("tsumo.docs.json has no mounts");

  const config = new DocsSiteConfig(mounts, strictLinks, generateSearchIndex, searchIndexFileName, homeMount, siteName);
  return new LoadedDocsConfig(candidate, config);
};
