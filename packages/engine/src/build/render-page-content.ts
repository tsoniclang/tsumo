import { BuildEnvironment } from "../env.js";
import { renderMarkdownWithShortcodes } from "../markdown.js";
import { HtmlString } from "../utils/html.js";
import { StandardPageGraph } from "./standard-page-graph.js";

export const renderStandardPageContent = (
  graph: StandardPageGraph,
  environment: BuildEnvironment,
): void => {
  for (const entry of graph.rawBodyByPage.entries()) {
    const page = entry[0];
    const rawBody = entry[1];
    if (rawBody === "") continue;
    const rendered = renderMarkdownWithShortcodes(rawBody, page, graph.site, environment);
    page.content = new HtmlString(rendered.html);
    page.summary = new HtmlString(rendered.summaryHtml);
    page.tableOfContents = new HtmlString(rendered.tableOfContents);
    page.plain = rendered.plainText;
  }
};
