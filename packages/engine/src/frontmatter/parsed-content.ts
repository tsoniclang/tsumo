import { FrontMatter } from "./data.js";

export class ParsedContent {
  frontMatter: FrontMatter;
  body: string;

  constructor(frontMatter: FrontMatter, body: string) {
    this.frontMatter = frontMatter;
    this.body = body;
  }
}
