import { MarkdownExtensions, MarkdownPipeline, MarkdownPipelineBuilder } from "markdig-types/Markdig.js";
import type { IMarkdownRenderer } from "markdig-types/Markdig.Renderers.js";
import { AutoIdentifierOptions } from "markdig-types/Markdig.Extensions.AutoIdentifiers.js";

const createPipeline = (): MarkdownPipeline => {
  const builder = new MarkdownPipelineBuilder();
  MarkdownExtensions.UseAutoIdentifiers(builder, AutoIdentifierOptions.GitHub);
  MarkdownExtensions.UsePipeTables(builder);
  MarkdownExtensions.UseTaskLists(builder);
  MarkdownExtensions.UseAutoLinks(builder);
  MarkdownExtensions.UseEmphasisExtras(builder);
  MarkdownExtensions.UseGenericAttributes(builder);
  MarkdownExtensions.UseAlertBlocks(builder);
  return builder.Build();
};

export const markdownPipeline = createPipeline();

// Helper to setup a renderer with the pipeline
export const setupRenderer = (renderer: IMarkdownRenderer): void => {
  markdownPipeline.Setup(renderer);
};
