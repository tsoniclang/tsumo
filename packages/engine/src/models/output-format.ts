import { MediaType } from "./media-type.ts";

export class OutputFormat {
  readonly Rel: string;
  readonly MediaType: MediaType;
  readonly Permalink: string;

  constructor(rel: string, mediaType: string, permalink: string) {
    this.Rel = rel;
    this.MediaType = new MediaType(mediaType);
    this.Permalink = permalink;
  }
}
