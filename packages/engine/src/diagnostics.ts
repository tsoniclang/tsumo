import { Exception } from "@tsonic/dotnet/System.js";

export type TsumoDiagnosticCategory = "error" | "warning";

export class TsumoDiagnostic {
  code: string;
  category: TsumoDiagnosticCategory;
  message: string;
  file: string | undefined;
  line: number | undefined;
  column: number | undefined;

  constructor(
    code: string,
    category: TsumoDiagnosticCategory,
    message: string,
    file?: string,
    line?: number,
    column?: number,
  ) {
    this.code = code;
    this.category = category;
    this.message = message;
    this.file = file;
    this.line = line;
    this.column = column;
  }

  format(): string {
    const location = this.file === undefined
      ? ""
      : this.line === undefined
        ? `${this.file}: `
        : `${this.file}:${this.line}:${this.column ?? 1}: `;
    return `${location}${this.code}: ${this.message}`;
  }
}

export class TsumoError extends Exception {
  diagnostic: TsumoDiagnostic;

  constructor(diagnostic: TsumoDiagnostic) {
    super(diagnostic.format());
    this.diagnostic = diagnostic;
  }
}

export function createTsumoError(
  code: string,
  message: string,
  file?: string,
  line?: number,
  column?: number,
): TsumoError {
  return new TsumoError(new TsumoDiagnostic(code, "error", message, file, line, column));
}
