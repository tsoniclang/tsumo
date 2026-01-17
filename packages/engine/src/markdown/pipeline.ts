import { MarkdownExtensions, MarkdownPipeline, MarkdownPipelineBuilder } from "markdig-types/Markdig.js";
import type { IMarkdownRenderer } from "markdig-types/Markdig.Renderers.js";
import { AutoIdentifierOptions } from "markdig-types/Markdig.Extensions.AutoIdentifiers.js";

const createPipeline = (): MarkdownPipeline => {
  const builder = new MarkdownPipelineBuilder();
  MarkdownExtensions.useAutoIdentifiers(builder, AutoIdentifierOptions.gitHub);
  MarkdownExtensions.usePipeTables(builder);
  MarkdownExtensions.useTaskLists(builder);
  MarkdownExtensions.useAutoLinks(builder);
  MarkdownExtensions.useEmphasisExtras(builder);
  MarkdownExtensions.useGenericAttributes(builder);
  MarkdownExtensions.useAlertBlocks(builder);
  return builder.build();
};

export const markdownPipeline = createPipeline();

// Helper to setup a renderer with the pipeline
export const setupRenderer = (renderer: IMarkdownRenderer): void => {
  markdownPipeline.setup(renderer);
};
