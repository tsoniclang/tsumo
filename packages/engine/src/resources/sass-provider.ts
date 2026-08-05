import { Buffer } from "node:buffer";
import { Environment, Guid } from "@tsonic/dotnet/System.js";
import { Process, ProcessStartInfo } from "@tsonic/dotnet/System.Diagnostics.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { createTsumoError } from "../diagnostics.js";
import { replaceText } from "../utils/strings.js";
import { Resource } from "./models.js";
import { splitResourceFileName, splitResourcePath } from "./paths.js";

const quoteProcessArgument = (argument: string): string => {
  const value = argument.trim();
  if (value === "") return "\"\"";
  if (!value.includes(" ") && !value.includes("\"")) return value;
  return "\"" + replaceText(value, "\"", "\\\"") + "\"";
};

const renderProcessArguments = (argumentsList: string[]): string => {
  const result = new StringBuilder();
  for (let index = 0; index < argumentsList.length; index++) {
    if (index > 0) result.Append(" ");
    result.Append(quoteProcessArgument(argumentsList[index]!));
  }
  return result.ToString();
};

export const compileSassResource = (
  resource: Resource,
  loadPaths: string[],
): Resource => {
  if (resource.text === undefined) {
    throw createTsumoError("TSUMO_SASS_TEXT_REQUIRED", "css.Sass requires a text resource");
  }

  const configuredExecutable = Environment.GetEnvironmentVariable("TSUMO_SASS");
  const executable = configuredExecutable !== undefined && configuredExecutable.trim() !== ""
    ? configuredExecutable.trim()
    : "sass";
  const workDirectory = Path.Combine(
    Path.GetTempPath(),
    `tsumo-sass-${Guid.NewGuid().ToString("n")}`,
  );
  Directory.CreateDirectory(workDirectory);

  try {
    const inputPath = Path.Combine(workDirectory, "input.scss");
    const outputPath = Path.Combine(workDirectory, "output.css");
    File.WriteAllText(inputPath, resource.text);

    const argumentsList: string[] = ["--no-source-map", "--style", "expanded"];
    for (let index = 0; index < loadPaths.length; index++) {
      const loadPath = loadPaths[index]!;
      if (!Directory.Exists(loadPath)) continue;
      argumentsList.push("--load-path");
      argumentsList.push(loadPath);
    }
    argumentsList.push(inputPath);
    argumentsList.push(outputPath);

    const startInfo = new ProcessStartInfo();
    startInfo.FileName = executable;
    startInfo.Arguments = renderProcessArguments(argumentsList);
    startInfo.RedirectStandardError = true;
    startInfo.UseShellExecute = false;
    startInfo.CreateNoWindow = true;

    let process: Process | undefined = undefined;
    try {
      process = Process.Start(startInfo);
    } catch (error) {
      throw createTsumoError(
        "TSUMO_SASS_START_FAILED",
        `Failed to start Sass compiler '${executable}': ${error}`,
      );
    }
    if (process === undefined) {
      throw createTsumoError("TSUMO_SASS_START_FAILED", `Failed to start Sass compiler '${executable}'`);
    }

    process.WaitForExit();
    if (process.ExitCode !== 0) {
      const stderr = process.StandardError.ReadToEnd().trim();
      throw createTsumoError(
        "TSUMO_SASS_FAILED",
        stderr === "" ? `Sass compiler failed with exit code ${process.ExitCode}` : stderr,
      );
    }
    if (!File.Exists(outputPath)) {
      throw createTsumoError("TSUMO_SASS_OUTPUT_MISSING", "Sass compiler completed without producing CSS");
    }

    const text = File.ReadAllText(outputPath);
    const outputPathRaw = resource.outputRelPath ?? "style.scss";
    const path = splitResourcePath(outputPathRaw);
    const file = splitResourceFileName(path.fileName);
    return new Resource(
      `${resource.id}|sass`,
      resource.sourcePath,
      true,
      path.directory + file.baseName + ".css",
      Buffer.from(text, "utf8"),
      text,
      resource.Data,
      "text/css",
    );
  } finally {
    if (Directory.Exists(workDirectory)) Directory.Delete(workDirectory, true);
  }
};
