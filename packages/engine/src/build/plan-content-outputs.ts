import { BuildEnvironment } from "../env.js";
import { addBundleResources } from "./bundle-resources.js";
import { renderWithBase, selectTemplate } from "./layout.js";
import { SiteOutputPlan } from "./output-plan.js";
import { joinSitePath, splitSitePath } from "./site-routes.js";
import { StandardPageGraph } from "./standard-page-graph.js";
import { StandardTemplates } from "./standard-templates.js";

const outputDirectory = (relativePath: string): string => {
  const segments = splitSitePath(relativePath);
  const directorySegments: string[] = [];
  for (let index = 0; index < segments.length - 1; index++) directorySegments.push(segments[index]!);
  return joinSitePath(directorySegments);
};

export const planContentOutputs = (
  graph: StandardPageGraph,
  environment: BuildEnvironment,
  templates: StandardTemplates,
  outputPlan: SiteOutputPlan,
  sitemapUrls: Map<string, boolean>,
): void => {
  for (let index = 0; index < graph.pageSources.length; index++) {
    const source = graph.pageSources[index]!;
    const page = graph.contentPages[index]!;
    const templateType = source.type !== "" ? source.type : source.section;
    const layout = source.layout;
    const candidates = layout !== undefined && layout.trim() !== ""
      ? [
          `${templateType}/${layout}.html`,
          `${source.section}/${layout}.html`,
          `_default/${layout}.html`,
          `${layout}.html`,
          `${templateType}/single.html`,
          `${source.section}/single.html`,
          "_default/single.html",
        ]
      : [
          `${templateType}/single.html`,
          source.section !== "" ? `${source.section}/single.html` : "_default/single.html",
          "_default/single.html",
        ];
    const main = selectTemplate(environment, candidates) ?? templates.single;
    const base = selectTemplate(
      environment,
      templateType !== ""
        ? [`${templateType}/baseof.html`, `${source.section}/baseof.html`, "_default/baseof.html", "baseof.html"]
        : ["_default/baseof.html", "baseof.html"],
    ) ?? templates.base;
    outputPlan.addText(
      source.outputRelPath,
      renderWithBase(environment, base, main, page),
      `content page '${source.sourcePath}'`,
    );
    sitemapUrls.set(page.relPermalink, true);
    const bundleSource = graph.bundleSourceByPage.get(page);
    if (bundleSource !== undefined) {
      addBundleResources(
        bundleSource,
        outputDirectory(source.outputRelPath),
        `leaf bundle '${source.sourcePath}'`,
        outputPlan,
      );
    }
  }
};
