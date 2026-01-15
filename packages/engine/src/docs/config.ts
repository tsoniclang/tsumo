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
  const root = doc.rootElement;
  if (root.valueKind !== JsonValueKind.object) return undefined;
  const propNameLower = propName.toLowerInvariant();
  const props = root.enumerateObject().getEnumerator();
  while (props.moveNext()) {
    const p = props.current;
    if (p.name.toLowerInvariant() === propNameLower) {
      if (p.value.valueKind === JsonValueKind.string) return p.value.getString();
      return undefined;
    }
  }
  return undefined;
};

const readBool = (doc: JsonDocument, propName: string): boolean | undefined => {
  const root = doc.rootElement;
  if (root.valueKind !== JsonValueKind.object) return undefined;
  const propNameLower = propName.toLowerInvariant();
  const props = root.enumerateObject().getEnumerator();
  while (props.moveNext()) {
    const p = props.current;
    if (p.name.toLowerInvariant() !== propNameLower) continue;
    if (p.value.valueKind === JsonValueKind.true) return true;
    if (p.value.valueKind === JsonValueKind.false) return false;
    return undefined;
  }
  return undefined;
};

const normalizePrefix = (raw: string): string => {
  const p = ensureLeadingSlash(raw.trim());
  return ensureTrailingSlash(p);
};

const resolveSourceDir = (siteDir: string, raw: string): string => {
  if (raw.trim() === "") throw new Exception("Docs mount `source` cannot be empty");
  return Path.isPathRooted(raw) ? Path.getFullPath(raw) : Path.getFullPath(Path.combine(siteDir, raw));
};

const parseMounts = (siteDir: string, doc: JsonDocument): DocsMountConfig[] => {
  const empty: DocsMountConfig[] = [];
  const root = doc.rootElement;
  if (root.valueKind !== JsonValueKind.object) return empty;

  const props = root.enumerateObject().getEnumerator();
  while (props.moveNext()) {
    const p = props.current;
    if (p.name.toLowerInvariant() !== "mounts") continue;
    if (p.value.valueKind !== JsonValueKind.array) return empty;

    const mounts = new List<DocsMountConfig>();
    const it = p.value.enumerateArray().getEnumerator();
    while (it.moveNext()) {
      const el = it.current;
      if (el.valueKind !== JsonValueKind.object) continue;

      let name: string | undefined = undefined;
      let source: string | undefined = undefined;
      let prefix: string | undefined = undefined;
      let repoUrl: string | undefined = undefined;
      let repoBranch = "main";
      let repoPath: string | undefined = undefined;
      let navPath: string | undefined = undefined;

      const mp = el.enumerateObject().getEnumerator();
      while (mp.moveNext()) {
        const prop = mp.current;
        const key = prop.name.toLowerInvariant();
        const v = prop.value;

        if (key === "name" && v.valueKind === JsonValueKind.string) name = v.getString();
        else if (key === "source" && v.valueKind === JsonValueKind.string) source = v.getString();
        else if (key === "prefix" && v.valueKind === JsonValueKind.string) prefix = v.getString();
        else if ((key === "repo" || key === "repourl") && v.valueKind === JsonValueKind.string) repoUrl = v.getString();
        else if ((key === "branch" || key === "repobranch") && v.valueKind === JsonValueKind.string) repoBranch = v.getString() ?? repoBranch;
        else if ((key === "repopath" || key === "subdir") && v.valueKind === JsonValueKind.string) repoPath = v.getString();
        else if ((key === "nav" || key === "navpath") && v.valueKind === JsonValueKind.string) navPath = v.getString();
      }

      if (source === undefined || prefix === undefined) continue;
      const sourceDir = resolveSourceDir(siteDir, source);
      const urlPrefix = normalizePrefix(prefix);
      const slash: char = "/";
      let mountName = name;
      if (mountName === undefined) {
        mountName = urlPrefix === "/" ? "Docs" : urlPrefix.trimStart(slash).trimEnd(slash);
      } else if (mountName.trim() === "") {
        mountName = urlPrefix === "/" ? "Docs" : urlPrefix.trimStart(slash).trimEnd(slash);
      }

      let finalRepoPath = repoPath;
      if (finalRepoPath === undefined && repoUrl !== undefined) {
        finalRepoPath = Path.getFileName(sourceDir);
      }

      mounts.add(new DocsMountConfig(mountName, sourceDir, urlPrefix, repoUrl, repoBranch, finalRepoPath, navPath));
    }

    return mounts.toArray();
  }

  return empty;
};

export const loadDocsConfig = (siteDir: string): LoadedDocsConfig | undefined => {
  const candidate = Path.combine(siteDir, "tsumo.docs.json");
  if (!fileExists(candidate)) return undefined;

  const text = readTextFile(candidate);
  const doc = JsonDocument.parse(text);

  const mounts = parseMounts(siteDir, doc);
  const strictLinks = readBool(doc, "strictLinks") ?? false;
  const generateSearchIndex = readBool(doc, "search") ?? true;
  const searchIndexFileName = readString(doc, "searchFile") ?? "search.json";
  const homeMount = readString(doc, "homeMount");
  const siteName = readString(doc, "siteName") ?? "Docs";

  doc.dispose();

  if (mounts.length === 0) throw new Exception("tsumo.docs.json has no mounts");

  const config = new DocsSiteConfig(mounts, strictLinks, generateSearchIndex, searchIndexFileName, homeMount, siteName);
  return new LoadedDocsConfig(candidate, config);
};
