import type { int32 } from "@tsonic/core/types.js";
import type { PageContext } from "../../models.js";
import { combineUrlPath } from "../../utils/url-path.js";
import { TemplateValue } from "./base.js";

export class PaginatorValue extends TemplateValue {
  sourcePages: PageContext[];
  pageSize: int32;
  pageNumber: int32;
  basePath: string;

  constructor(sourcePages: PageContext[], pageSize: int32, pageNumber: int32, basePath: string) {
    super();
    this.sourcePages = sourcePages;
    this.pageSize = pageSize > 0 ? pageSize : 1;
    this.pageNumber = pageNumber > 0 ? pageNumber : 1;
    this.basePath = basePath;
  }

  totalPages(): int32 {
    if (this.sourcePages.length === 0) return 1;
    return Math.ceil(this.sourcePages.length / this.pageSize) as int32;
  }

  pages(): PageContext[] {
    const start: int32 = (this.pageNumber - 1) * this.pageSize;
    const end: int32 = Math.min(start + this.pageSize, this.sourcePages.length) as int32;
    const pages: PageContext[] = [];
    for (let index: int32 = start; index < end; index++) pages.push(this.sourcePages[index]!);
    return pages;
  }

  url(): string {
    return this.pageNumber <= 1 ? combineUrlPath([this.basePath]) : combineUrlPath([this.basePath, "page", `${this.pageNumber}`]);
  }

  withPageNumber(pageNumber: int32): PaginatorValue {
    return new PaginatorValue(this.sourcePages, this.pageSize, pageNumber, this.basePath);
  }

  hasSameSource(other: PaginatorValue): boolean {
    if (this.pageSize !== other.pageSize || this.basePath !== other.basePath || this.sourcePages.length !== other.sourcePages.length) return false;
    for (let index = 0; index < this.sourcePages.length; index++) {
      if (this.sourcePages[index] !== other.sourcePages[index]) return false;
    }
    return true;
  }
}
