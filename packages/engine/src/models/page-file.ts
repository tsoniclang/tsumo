export class PageFile {
  Filename: string;
  Dir: string;
  BaseFileName: string;

  constructor(filename: string, dir: string, baseFileName: string) {
    this.Filename = filename;
    this.Dir = dir;
    this.BaseFileName = baseFileName;
  }
}
