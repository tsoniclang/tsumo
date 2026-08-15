import { Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { loadSiteConfig } from "../config.js";
import { BuildEnvironment } from "../env.js";
import { BuildRequest } from "../models.js";
import { renderRobotsTxt, renderRss, renderSitemap } from "../outputs.js";
import { ensureTrailingSlash } from "../utils/text.js";
import { discoverContent } from "./discover-content.js";
import { resolveThemeDir } from "./layout.js";
import { SiteOutputPlan } from "./output-plan.js";
import { planContentOutputs } from "./plan-content-outputs.js";
import { planHomeOutput } from "./plan-home-output.js";
import { planListOutputs } from "./plan-list-outputs.js";
import { planTaxonomyOutputs } from "./plan-taxonomy-outputs.js";
import { renderStandardPageContent } from "./render-page-content.js";
import { compareSitePaths } from "./site-routes.js";
import { createStandardPageGraph } from "./standard-page-graph.js";
import { createStandardTaxonomies } from "./standard-taxonomies.js";
import { selectStandardTemplates } from "./standard-templates.js";

export const buildStandardSite = (request: BuildRequest, siteDir: string, outDir: string): int32 => {
  const config = loadSiteConfig(siteDir).config;
  const requestedBaseUrl = request.baseURL;
  if (requestedBaseUrl !== undefined && requestedBaseUrl.trim() !== "") {
    config.baseURL = ensureTrailingSlash(requestedBaseUrl.trim());
  }

  const themeDir = resolveThemeDir(siteDir, config, request.themesDir);
  const environment = new BuildEnvironment(siteDir, themeDir, outDir, config.moduleMounts, request.buildTime);
  const outputPlan = new SiteOutputPlan();
  if (themeDir !== undefined) {
    outputPlan.addDirectory(Path.Combine(themeDir, "static"), "", "theme static files", "theme-static");
  }
  outputPlan.addDirectory(Path.Combine(siteDir, "static"), "", "site static files", "site-static");

  const inventory = discoverContent(Path.Combine(siteDir, config.contentDir), request.buildDrafts);
  const pageGraph = createStandardPageGraph(config, inventory);
  const taxonomies = createStandardTaxonomies(pageGraph);
  renderStandardPageContent(pageGraph, environment);
  const templates = selectStandardTemplates(environment);

  const sitemapUrls = new Map<string, boolean>();
  planHomeOutput(pageGraph, environment, templates, outputPlan, sitemapUrls);
  planListOutputs(pageGraph, environment, templates, outputPlan, sitemapUrls);
  planTaxonomyOutputs(taxonomies, environment, templates, outputPlan, sitemapUrls);
  planContentOutputs(pageGraph, environment, templates, outputPlan, sitemapUrls);

  const orderedSitemapUrls = Array.from(sitemapUrls.keys());
  orderedSitemapUrls.sort((left: string, right: string) => compareSitePaths(left, right));
  outputPlan.addDefaultText(
    "sitemap.xml",
    renderSitemap(config, orderedSitemapUrls, request.buildTime),
    "generated sitemap",
  );
  outputPlan.addDefaultText("index.xml", renderRss(config, pageGraph.contentPages, request.buildTime), "generated RSS");
  outputPlan.addDefaultText("robots.txt", renderRobotsTxt(config), "generated robots policy");
  outputPlan.applyDeferredTemplateResults(environment.finalizeDeferredTemplates());
  outputPlan.render(outDir);
  return outputPlan.generatedOutputCount();
};
