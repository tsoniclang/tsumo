import { Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { Markdown } from "@tsonic/dotnet/Markdig.js";
import { renderWithBase, resolveThemeDir, selectTemplate } from "../build/layout.js";
import { combineUrlPath } from "../utils/url-path.js";
import { SiteOutputPlan } from "../build/output-plan.js";
import { loadSiteConfig } from "../config.js";
import { createTsumoError } from "../diagnostics.js";
import { BuildEnvironment } from "../env.js";
import { markdownPipeline } from "../markdown.js";
import { BuildRequest, PageContext, PageFile, SiteContext } from "../models.js";
import { ParamValue } from "../params.js";
import { HtmlString } from "../utils/html.js";
import { compareText } from "../utils/strings.js";
import { ensureTrailingSlash, humanizeSlug } from "../utils/text.js";
import { LoadedDocsConfig } from "./config.js";
import { loadDocsContent } from "./content.js";
import {
  addDocsDirectoryWithParents,
  assignDocsPageAncestry,
  docsDirectoryDepth,
  docsDirectoryName,
  docsParentDirectory,
} from "./directory-graph.js";
import { createDocsEditUrl } from "./edit-url.js";
import { DocsLinkRewriteContext, renderDocsMarkdown } from "./markdown.js";
import { DocsMountContext } from "./models.js";
import { loadMountNav } from "./nav.js";
import {
  docsOutputPathForPermalink,
  DocsOutputClaims,
} from "./output.js";
import {
  discoverDocsMountRoutes,
  docsMountPrefixSegments,
  withoutMarkdownExtension,
} from "./routes.js";
import { renderSearchIndexJson, SearchDocument } from "./search-index.js";

export const buildDocsSite = (request: BuildRequest, docsLoaded: LoadedDocsConfig, outDir: string): int32 => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const loaded = loadSiteConfig(siteDir);
  const config = loaded.config;

  const requestBaseURL = request.baseURL;
  if (requestBaseURL !== undefined && requestBaseURL.trim() !== "") {
    config.baseURL = ensureTrailingSlash(requestBaseURL.trim());
  }

  const docsConfig = docsLoaded.config;
  if (docsConfig.siteName.trim() !== "") config.title = docsConfig.siteName.trim();

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const env = new BuildEnvironment(siteDir, themeDir, outDir, [], request.buildTime);
  const outputPlan = new SiteOutputPlan();

  if (themeDir !== undefined) {
    outputPlan.addDirectory(Path.Combine(themeDir, "static"), "", "theme static files", "theme-static");
  }
  outputPlan.addDirectory(Path.Combine(siteDir, "static"), "", "site static files", "site-static");

  const emptyPages: PageContext[] = [];
  const emptyTranslations: PageContext[] = [];
  const emptyStrings: string[] = [];
  const site = new SiteContext(config, emptyPages, undefined, undefined);
  site.Sites = [site];

  const baseTpl = selectTemplate(env, ["_default/baseof.html"]);
  const homeTpl = selectTemplate(env, ["index.html", "docs/home.html", "docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const listTpl = selectTemplate(env, ["docs/list.html", "_default/list.html"]) ?? "_default/list.html";
  const singleTpl = selectTemplate(env, ["docs/single.html", "_default/single.html"]) ?? "_default/single.html";

  const mountRootPages: PageContext[] = [];
  const allPagesForOutput: PageContext[] = [];
  const mountContexts: DocsMountContext[] = [];
  const searchDocs: SearchDocument[] = [];
  const outputClaims = new DocsOutputClaims();
  let rootMountOwnsHome = false;

  const mounts = docsConfig.mounts;
  for (let mountIndex = 0; mountIndex < mounts.length; mountIndex++) {
    const mount = mounts[mountIndex]!;
    const discovered = discoverDocsMountRoutes(mount);
    const content = loadDocsContent(discovered.markdown, request.buildDrafts);
    for (let index = 0; index < discovered.assets.length; index++) {
      const asset = discovered.assets[index]!;
      outputClaims.add(asset.outputRelPath, asset.sourcePath);
      outputPlan.addAsset(asset.outputRelPath, asset.sourcePath, `docs asset '${asset.sourcePath}'`, "docs-asset");
    }
    for (const indexed of content.indexByDirectory.values()) {
      outputClaims.add(indexed.route.outputRelPath, indexed.route.sourcePath);
    }
    for (let index = 0; index < content.leaves.length; index++) {
      const leaf = content.leaves[index]!;
      outputClaims.add(leaf.route.outputRelPath, leaf.route.sourcePath);
    }
    const routeMap = content.permalinkByRelativePath;
    mountContexts.push(new DocsMountContext(mount.name, mount.urlPrefix, loadMountNav(mount, routeMap)));

    const prefixSegs = docsMountPrefixSegments(mount.urlPrefix);
    if (prefixSegs.length === 0) rootMountOwnsHome = true;
    const mountSection = prefixSegs.length > 0 ? prefixSegs[0]! : mount.name;

    const indexByDir = content.indexByDirectory;

    const leafPagesByDir = new Map<string, PageContext[]>();
    const leafArr = content.leaves;
    for (let i = 0; i < leafArr.length; i++) {
      const source = leafArr[i]!;
      const r = source.route;
      const parsed = source.parsed;
      const fm = parsed.frontMatter;

      const md = renderDocsMarkdown(
        parsed.body,
        new DocsLinkRewriteContext(mount, r.sourcePath, r.dirKey, routeMap, docsConfig.strictLinks),
      );
      const content = new HtmlString(md.html);
      const summary = new HtmlString(md.summaryHtml);
      const plainText = Markdown.ToPlainText(parsed.body, markdownPipeline);

      const baseName = withoutMarkdownExtension(r.fileName);
      const title = fm.title ?? humanizeSlug(baseName);
      const dateUtc = fm.date ?? source.modifiedAt;
      const dateString = dateUtc.toISOString();
      const lastmodString = source.modifiedAt.toISOString();
      const file = new PageFile(Path.GetFullPath(r.sourcePath), r.dirKey === "" ? "" : r.dirKey + "/", baseName);

      const params = fm.Params;
      params.set("mount", ParamValue.string(mount.name));
      params.set("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.set("relPath", ParamValue.string(r.relPath));
      const editUrl = createDocsEditUrl(mount, r.relPath);
      if (editUrl !== undefined) {
        params.set("editURL", ParamValue.string(editUrl));
      }

      const ctx = new PageContext(
        title,
        dateString,
        lastmodString,
        fm.draft,
        "page",
        mountSection,
        fm.type ?? "docs",
        baseName,
        r.relPermalink,
        plainText,
        new HtmlString(""),
        content,
        summary,
        fm.description ?? "",
        fm.tags,
        fm.categories,
        params,
        file,
        site.Language,
        emptyTranslations,
        undefined,
        site,
        emptyPages,
        undefined,
        emptyPages,
        fm.layout,
      );

      let list = leafPagesByDir.get(r.dirKey);
      if (list === undefined) {
        list = [];
        leafPagesByDir.set(r.dirKey, list);
      }
      list.push(ctx);
      allPagesForOutput.push(ctx);
      searchDocs.push(new SearchDocument(title, r.relPermalink, mount.name, plainText));
    }

    const dirSet = new Map<string, boolean>();
    addDocsDirectoryWithParents("", dirSet);
    for (const indexKey of indexByDir.keys()) addDocsDirectoryWithParents(indexKey, dirSet);
    for (const leafKey of leafPagesByDir.keys()) addDocsDirectoryWithParents(leafKey, dirSet);

    const childDirsByDir = new Map<string, string[]>();
    for (const childDirKey of dirSet.keys()) {
      if (childDirKey === "") continue;
      const parentKey = docsParentDirectory(childDirKey);
      let list = childDirsByDir.get(parentKey);
      if (list === undefined) {
        list = [];
        childDirsByDir.set(parentKey, list);
      }
      list.push(childDirKey);
    }

    const dirKeys: string[] = [];
    for (const collectedDirKey of dirSet.keys()) dirKeys.push(collectedDirKey);
    dirKeys.sort((a: string, b: string) => {
      const depth = docsDirectoryDepth(b) - docsDirectoryDepth(a);
      return depth !== 0 ? depth : compareText(a, b);
    });

    const sectionByDir = new Map<string, PageContext>();

    for (let i = 0; i < dirKeys.length; i++) {
      const dirKey = dirKeys[i]!;

      const childPages: PageContext[] = [];

      const childDirList = childDirsByDir.get(dirKey);
      if (childDirList !== undefined) {
        childDirList.sort((a: string, b: string) => compareText(a, b));
        const childDirKeys = childDirList;
        for (let j = 0; j < childDirKeys.length; j++) {
          const childKey = childDirKeys[j]!;
          const childSection = sectionByDir.get(childKey);
          if (childSection !== undefined) childPages.push(childSection);
        }
      }

      const leafList = leafPagesByDir.get(dirKey);
      if (leafList !== undefined) {
        leafList.sort((a: PageContext, b: PageContext) => compareText(a.title, b.title));
        const leafPages = leafList;
        for (let j = 0; j < leafPages.length; j++) childPages.push(leafPages[j]!);
      }

      const routeSegments: string[] = dirKey === "" ? emptyStrings : dirKey.split("/");
      const urlParts: string[] = [];
      urlParts.push(mount.urlPrefix);
      for (let j = 0; j < routeSegments.length; j++) urlParts.push(routeSegments[j]!);
      const relPermalink = combineUrlPath(urlParts);

      const idxRoute = indexByDir.get(dirKey);
      if (idxRoute === undefined) {
        outputClaims.add(
          docsOutputPathForPermalink(relPermalink),
          `<generated docs section ${mount.name}:${dirKey}>`,
        );
      }

      const dirSlug = dirKey === "" ? mountSection : docsDirectoryName(dirKey);
      let title = dirKey === "" ? mount.name : humanizeSlug(dirSlug);
      let content = new HtmlString("");
      let summary = new HtmlString("");
      let plain = "";
      let description = "";
      let params = new Map<string, ParamValue>();
      let draft = false;
      let dateString = "";
      let lastmodString = "";
      let file: PageFile | undefined = undefined;
      let layout: string | undefined = undefined;

      if (idxRoute !== undefined) {
        const parsed = idxRoute.parsed;
        const route = idxRoute.route;
        const fm = parsed.frontMatter;
        draft = fm.draft;
        layout = fm.layout;
        if (draft && !request.buildDrafts) {
          // Draft section index: keep default empty content, but still generate list page.
        } else {
          const md = renderDocsMarkdown(
            parsed.body,
            new DocsLinkRewriteContext(mount, route.sourcePath, dirKey, routeMap, docsConfig.strictLinks),
          );
          content = new HtmlString(md.html);
          summary = new HtmlString(md.summaryHtml);
          description = fm.description ?? "";
          title = fm.title ?? title;
          const plainText = Markdown.ToPlainText(parsed.body, markdownPipeline);
          plain = plainText;
          searchDocs.push(new SearchDocument(title, relPermalink, mount.name, plainText));
          const dateUtc = fm.date ?? idxRoute.modifiedAt;
          dateString = dateUtc.toISOString();
          lastmodString = idxRoute.modifiedAt.toISOString();
          file = new PageFile(Path.GetFullPath(route.sourcePath), dirKey === "" ? "" : dirKey + "/", "_index");
          params = fm.Params;
          params.set("relPath", ParamValue.string(route.relPath));
          const editUrl = createDocsEditUrl(mount, route.relPath);
          if (editUrl !== undefined) {
            params.set("editURL", ParamValue.string(editUrl));
          }
        }
      }

      params.set("mount", ParamValue.string(mount.name));
      params.set("mountPrefix", ParamValue.string(mount.urlPrefix));
      params.set("dirKey", ParamValue.string(dirKey));

      const slug = dirSlug;
      const sectionCtx = new PageContext(
        title,
        dateString,
        lastmodString,
        draft,
        "section",
        mountSection,
        "docs",
        slug,
        relPermalink,
        plain,
        new HtmlString(""),
        content,
        summary,
        description,
        emptyStrings,
        emptyStrings,
        params,
        file,
        site.Language,
        emptyTranslations,
        undefined,
        site,
        childPages,
        undefined,
        emptyPages,
        layout,
      );

      sectionByDir.set(dirKey, sectionCtx);
      allPagesForOutput.push(sectionCtx);
    }

    const mountRoot = sectionByDir.get("");
    if (mountRoot !== undefined) {
      mountRootPages.push(mountRoot);
    }
  }

  const mountRoots = mountRootPages;
  site.pages = mountRoots;
  site.docsMounts = mountContexts;

  const homeMount = docsConfig.homeMount;
  const chosenHome =
    homeMount !== undefined && homeMount.trim() !== ""
      ? homeMount.trim().toLowerCase()
      : undefined;

  if (!rootMountOwnsHome) outputClaims.add("index.html", "<generated docs home>");

  let homeContent = new HtmlString("");
  let homeSummary = new HtmlString("");
  let homeDescription = "";
  let homeTitle = config.title;
  let homeMountMatched = chosenHome === undefined;

  if (chosenHome !== undefined) {
    for (let i = 0; i < mountRoots.length; i++) {
      const m = mountRoots[i]!;
      const mountNameParam = m.Params.get("mount") ?? ParamValue.string("");
      const mountPrefixParam = m.Params.get("mountPrefix") ?? ParamValue.string("");
      const mountName = mountNameParam.stringValue;
      const mountPrefix = mountPrefixParam.stringValue;
      if (mountName.toLowerCase() === chosenHome || mountPrefix.toLowerCase() === chosenHome) {
        homeTitle = m.title;
        homeContent = m.content;
        homeSummary = m.summary;
        homeDescription = m.description;
        homeMountMatched = true;
        break;
      }
    }
  }
  if (!homeMountMatched) {
    throw createTsumoError(
      "TSUMO_DOCS_HOME_MOUNT_NOT_FOUND",
      `Configured homeMount does not match a docs mount: ${homeMount ?? ""}`,
      docsLoaded.path,
    );
  }

  const homeCtx = new PageContext(
    homeTitle,
    "",
    "",
    false,
    "home",
    "",
    "docs",
    "",
    "/",
    "",
    new HtmlString(""),
    homeContent,
    homeSummary,
    homeDescription,
    emptyStrings,
    emptyStrings,
    new Map<string, ParamValue>(),
    undefined,
    site.Language,
    emptyTranslations,
    undefined,
    site,
    mountRoots,
    undefined,
    emptyPages,
    undefined,
  );

  assignDocsPageAncestry(homeCtx, undefined, emptyPages);
  site.home = homeCtx;
  const allSitePages: PageContext[] = [homeCtx];
  for (let index = 0; index < allPagesForOutput.length; index++) allSitePages.push(allPagesForOutput[index]!);
  site.allPages = allSitePages;

  const homeHtml = renderWithBase(env, baseTpl, homeTpl, homeCtx);
  outputPlan.addText("index.html", homeHtml, "docs home page");

  // Render all docs pages (skip the home page, which is always /index.html).
  const allPages = allPagesForOutput;
  for (let i = 0; i < allPages.length; i++) {
    const page = allPages[i]!;
    if (page.relPermalink === "/") continue;

    const tpl = page.kind === "page" ? singleTpl : listTpl;
    const html = renderWithBase(env, baseTpl, tpl, page);

    const outputRelPath = docsOutputPathForPermalink(page.relPermalink);
    outputPlan.addText(outputRelPath, html, `docs page '${page.relPermalink}'`);
  }

  if (docsConfig.generateSearchIndex) {
    const name = docsConfig.searchIndexFileName.trim();
    if (name !== "") {
      outputClaims.add(name, "<generated docs search index>");
      const json = renderSearchIndexJson(searchDocs);
      outputPlan.addText(name, json, "docs search index");
    }
  }

  outputPlan.applyDeferredTemplateResults(env.finalizeDeferredTemplates());
  outputPlan.render(outDir);
  return outputPlan.generatedOutputCount();
};
