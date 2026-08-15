import { PageContext } from "../models.js";
import { ParamValue } from "../params.js";
import { HtmlString } from "../utils/html.js";
import { humanizeSlug, slugify } from "../utils/text.js";
import { compareText } from "../utils/strings.js";
import { combineUrlPath } from "../utils/url-path.js";
import { StandardPageGraph } from "./standard-page-graph.js";

export class StandardTaxonomy {
  name: string;
  root: PageContext;
  terms: PageContext[];

  constructor(name: string, root: PageContext, terms: PageContext[]) {
    this.name = name;
    this.root = root;
    this.terms = terms;
  }
}

export class StandardTaxonomyGraph {
  taxonomies: StandardTaxonomy[];

  constructor(taxonomies: StandardTaxonomy[]) {
    this.taxonomies = taxonomies;
  }
}

const createTaxonomyPage = (
  graph: StandardPageGraph,
  taxonomy: string,
  pagesByTerm: Map<string, PageContext[]>,
): StandardTaxonomy => {
  const emptyStrings: string[] = [];
  const emptyPages: PageContext[] = [];
  const emptyHtml = new HtmlString("");
  const taxonomyParameters = new Map<string, ParamValue>();
  taxonomyParameters.set("taxonomy", ParamValue.string(taxonomy));
  const root = new PageContext(
    humanizeSlug(taxonomy),
    "",
    "",
    false,
    "taxonomy",
    taxonomy,
    taxonomy,
    taxonomy,
    combineUrlPath([taxonomy]),
    "",
    emptyHtml,
    emptyHtml,
    emptyHtml,
    "",
    emptyStrings,
    emptyStrings,
    taxonomyParameters,
    undefined,
    graph.site.Language,
    emptyPages,
    undefined,
    graph.site,
    emptyPages,
    graph.home,
    [graph.home],
    undefined,
  );

  const termSlugs = Array.from(pagesByTerm.keys());
  termSlugs.sort((left: string, right: string) => compareText(left, right));
  const terms: PageContext[] = [];
  for (let index = 0; index < termSlugs.length; index++) {
    const termSlug = termSlugs[index]!;
    const termPages = pagesByTerm.get(termSlug);
    if (termPages === undefined) continue;
    const parameters = new Map<string, ParamValue>();
    parameters.set("term", ParamValue.string(termSlug));
    parameters.set("taxonomy", ParamValue.string(taxonomy));
    const term = new PageContext(
      humanizeSlug(termSlug),
      "",
      "",
      false,
      "term",
      taxonomy,
      taxonomy,
      termSlug,
      combineUrlPath([taxonomy, termSlug]),
      "",
      new HtmlString(""),
      new HtmlString(""),
      new HtmlString(""),
      "",
      emptyStrings,
      emptyStrings,
      parameters,
      undefined,
      graph.site.Language,
      emptyPages,
      undefined,
      graph.site,
      termPages,
      root,
      [graph.home, root],
      undefined,
    );
    terms.push(term);
  }
  root.pages = terms;
  const termPages = new Map<string, PageContext>();
  for (let index = 0; index < terms.length; index++) {
    const term = terms[index]!;
    termPages.set(term.slug, term);
  }
  graph.site.taxonomyTermPages.set(taxonomy, termPages);
  return new StandardTaxonomy(taxonomy, root, terms);
};

const collectTerms = (
  pages: PageContext[],
  selectTerms: (page: PageContext) => string[],
): Map<string, PageContext[]> => {
  const pagesByTerm = new Map<string, PageContext[]>();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!;
    const terms = selectTerms(page);
    for (let termIndex = 0; termIndex < terms.length; termIndex++) {
      const termText = terms[termIndex]!.trim();
      if (termText === "") continue;
      const termSlug = slugify(termText);
      if (termSlug === "") continue;
      const termPages = pagesByTerm.get(termSlug) ?? [];
      termPages.push(page);
      pagesByTerm.set(termSlug, termPages);
    }
  }
  return pagesByTerm;
};

export const createStandardTaxonomies = (graph: StandardPageGraph): StandardTaxonomyGraph => {
  const tagsByTerm = collectTerms(graph.contentPages, (page: PageContext) => page.tags);
  const categoriesByTerm = collectTerms(graph.contentPages, (page: PageContext) => page.categories);
  graph.site.Taxonomies.set("tags", tagsByTerm);
  graph.site.Taxonomies.set("categories", categoriesByTerm);

  const taxonomies = [
    createTaxonomyPage(graph, "tags", tagsByTerm),
    createTaxonomyPage(graph, "categories", categoriesByTerm),
  ];
  const allPages: PageContext[] = [];
  for (let index = 0; index < graph.site.allPages.length; index++) allPages.push(graph.site.allPages[index]!);
  for (let taxonomyIndex = 0; taxonomyIndex < taxonomies.length; taxonomyIndex++) {
    const taxonomy = taxonomies[taxonomyIndex]!;
    allPages.push(taxonomy.root);
    for (let termIndex = 0; termIndex < taxonomy.terms.length; termIndex++) allPages.push(taxonomy.terms[termIndex]!);
  }
  graph.site.allPages = allPages;
  return new StandardTaxonomyGraph(taxonomies);
};
