import { BuildEnvironment } from "../env.js";
import { renderWithBase, selectTemplate } from "./layout.js";
import { SiteOutputPlan } from "./output-plan.js";
import { siteOutputPath } from "./site-routes.js";
import { StandardTaxonomyGraph } from "./standard-taxonomies.js";
import { StandardTemplates } from "./standard-templates.js";

export const planTaxonomyOutputs = (
  taxonomies: StandardTaxonomyGraph,
  environment: BuildEnvironment,
  templates: StandardTemplates,
  outputPlan: SiteOutputPlan,
  sitemapUrls: Map<string, boolean>,
): void => {
  for (let taxonomyIndex = 0; taxonomyIndex < taxonomies.taxonomies.length; taxonomyIndex++) {
    const taxonomy = taxonomies.taxonomies[taxonomyIndex]!;
    for (let termIndex = 0; termIndex < taxonomy.terms.length; termIndex++) {
      const term = taxonomy.terms[termIndex]!;
      const main = selectTemplate(
        environment,
        [`${taxonomy.name}/taxonomy.html`, "taxonomy/taxonomy.html", "_default/taxonomy.html", "_default/list.html"],
      ) ?? templates.list;
      const base = selectTemplate(
        environment,
        [`${taxonomy.name}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"],
      ) ?? templates.base;
      outputPlan.addText(
        siteOutputPath([taxonomy.name, term.slug]),
        renderWithBase(environment, base, main, term),
        `taxonomy term '${taxonomy.name}/${term.slug}'`,
      );
      sitemapUrls.set(term.relPermalink, true);
    }

    const root = taxonomy.root;
    const main = selectTemplate(
      environment,
      [`${taxonomy.name}/terms.html`, "taxonomy/terms.html", "_default/terms.html", "_default/list.html"],
    ) ?? templates.list;
    const base = selectTemplate(
      environment,
      [`${taxonomy.name}/baseof.html`, "taxonomy/baseof.html", "_default/baseof.html"],
    ) ?? templates.base;
    outputPlan.addText(
      siteOutputPath([taxonomy.name]),
      renderWithBase(environment, base, main, root),
      `taxonomy '${taxonomy.name}'`,
    );
    sitemapUrls.set(root.relPermalink, true);
  }
};
