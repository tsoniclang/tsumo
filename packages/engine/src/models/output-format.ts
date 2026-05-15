import { MediaType } from "./media-type.ts";

export class OutputFormat {
  Rel: string;
  MediaType: MediaType;
  Permalink: string;

  constructor(rel: string, mediaType: string, permalink: string) {
    this.Rel = rel;
    this.MediaType = new MediaType(mediaType);
    this.Permalink = permalink;
  }
}
