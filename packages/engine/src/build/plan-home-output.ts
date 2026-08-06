import { BuildEnvironment } from "../env.js";
import { addBundleResources } from "./bundle-resources.js";
import { renderWithBase } from "./layout.js";
import { SiteOutputPlan } from "./output-plan.js";
import { StandardPageGraph } from "./standard-page-graph.js";
import { StandardTemplates } from "./standard-templates.js";

export const planHomeOutput = (
  graph: StandardPageGraph,
  environment: BuildEnvironment,
  templates: StandardTemplates,
  outputPlan: SiteOutputPlan,
  sitemapUrls: Map<string, boolean>,
): void => {
  outputPlan.addText(
    "index.html",
    renderWithBase(environment, templates.base, templates.home, graph.home),
    "home page",
  );
  sitemapUrls.set("/", true);
  const bundleSource = graph.bundleSourceByPage.get(graph.home);
  if (bundleSource !== undefined) addBundleResources(bundleSource, "", "home bundle", outputPlan);
};
