import { BuildEnvironment } from "../env.js";
import { addBundleResources } from "./bundle-resources.js";
import { renderWithBase, selectTemplate } from "./layout.js";
import { SiteOutputPlan } from "./output-plan.js";
import { siteOutputPath, splitSitePath } from "./site-routes.js";
import { StandardPageGraph } from "./standard-page-graph.js";
import { StandardTemplates } from "./standard-templates.js";

export const planListOutputs = (
  graph: StandardPageGraph,
  environment: BuildEnvironment,
  templates: StandardTemplates,
  outputPlan: SiteOutputPlan,
  sitemapUrls: Map<string, boolean>,
): void => {
  for (let index = 0; index < graph.listRoutes.length; index++) {
    const route = graph.listRoutes[index]!;
    if (route === "") continue;
    const page = graph.listPagesByRoute.get(route);
    if (page === undefined) continue;
    const main = selectTemplate(
      environment,
      [`${page.type}/list.html`, `${page.section}/list.html`, "_default/list.html"],
    ) ?? templates.list;
    const base = selectTemplate(
      environment,
      [`${page.type}/baseof.html`, `${page.section}/baseof.html`, "_default/baseof.html"],
    ) ?? templates.base;
    outputPlan.addText(
      siteOutputPath(splitSitePath(route)),
      renderWithBase(environment, base, main, page),
      `section '${route}'`,
    );
    sitemapUrls.set(page.relPermalink, true);
    const bundleSource = graph.bundleSourceByPage.get(page);
    if (bundleSource !== undefined) {
      addBundleResources(bundleSource, route, `section bundle '${route}'`, outputPlan);
    }
  }
};
