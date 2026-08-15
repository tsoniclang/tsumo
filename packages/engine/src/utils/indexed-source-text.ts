import type { int32 } from "@tsonic/core/types.js";

export class IndexedSourceText {
  characters: string[];
  utf16Offsets: int32[];
  length: int32;

  constructor(source: string) {
    this.characters = Array.from(source);
    this.utf16Offsets = [0];
    let utf16Offset: int32 = 0;
    for (let index: int32 = 0; index < this.characters.length; index++) {
      utf16Offset += this.characters[index]!.length as int32;
      this.utf16Offsets.push(utf16Offset);
    }
    this.length = this.characters.length as int32;
  }

  characterAt(index: int32): string {
    if (index < 0 || index >= this.length) return "";
    return this.characters[index]!;
  }

  slice(start: int32, end: int32): string {
    return this.characters.slice(start, end).join("");
  }

  utf16OffsetAt(index: int32): int32 {
    return this.utf16Offsets[index]!;
  }
}
