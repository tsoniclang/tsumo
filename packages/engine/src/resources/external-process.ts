import type { int32 } from "@tsonic/core/types.js";
import { Process, ProcessStartInfo } from "@tsonic/dotnet/System.Diagnostics.js";
import { createTsumoError } from "../diagnostics.js";

export class ExternalProcessResult {
  exitCode: int32;
  standardError: string;

  constructor(exitCode: int32, standardError: string) {
    this.exitCode = exitCode;
    this.standardError = standardError;
  }
}

export const runExternalProcess = (
  executable: string,
  argumentsList: string[],
  toolName: string,
  startDiagnosticCode: string,
): ExternalProcessResult => {
  const startInfo = new ProcessStartInfo();
  startInfo.FileName = executable;
  for (let index = 0; index < argumentsList.length; index++) {
    startInfo.ArgumentList.Add(argumentsList[index]!);
  }
  startInfo.RedirectStandardError = true;
  startInfo.UseShellExecute = false;
  startInfo.CreateNoWindow = true;

  let process: Process | undefined = undefined;
  try {
    process = Process.Start(startInfo);
  } catch (error) {
    throw createTsumoError(
      startDiagnosticCode,
      `Failed to start ${toolName} '${executable}': ${error}`,
    );
  }
  if (process === undefined) {
    throw createTsumoError(startDiagnosticCode, `Failed to start ${toolName} '${executable}'`);
  }
  const standardError = process.StandardError.ReadToEnd().trim();
  process.WaitForExit();
  return new ExternalProcessResult(process.ExitCode, standardError);
};
