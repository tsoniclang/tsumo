export class PageFile {
  readonly Filename: string;
  readonly Dir: string;
  readonly BaseFileName: string;

  constructor(filename: string, dir: string, baseFileName: string) {
    this.Filename = filename;
    this.Dir = dir;
    this.BaseFileName = baseFileName;
  }
}
