import { FrontMatter } from "./data.ts";

export class ParsedContent {
  readonly frontMatter: FrontMatter;
  readonly body: string;

  constructor(frontMatter: FrontMatter, body: string) {
    this.frontMatter = frontMatter;
    this.body = body;
  }
}
