import { Buffer } from "node:buffer";
import { Environment, Guid } from "@tsonic/dotnet/System.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { createTsumoError } from "../diagnostics.js";
import { Resource } from "./models.js";
import { runExternalProcess } from "./external-process.js";
import { splitResourceFileName, splitResourcePath } from "./paths.js";
import { readResourceText } from "./text.js";

export const compileSassResource = (
  resource: Resource,
  loadPaths: string[],
): Resource => {
  const sourceText = readResourceText(resource, "css.Sass");

  const configuredExecutable = Environment.GetEnvironmentVariable("TSUMO_SASS");
  const executable = configuredExecutable !== undefined && configuredExecutable.trim() !== ""
    ? configuredExecutable.trim()
    : "sass";
  const configuredImplementation = Environment.GetEnvironmentVariable("TSUMO_SASS_IMPLEMENTATION");
  const implementation = configuredImplementation === undefined || configuredImplementation.trim() === ""
    ? "dart-sass"
    : configuredImplementation.trim().toLowerCase();
  if (implementation !== "dart-sass" && implementation !== "libsass") {
    throw createTsumoError(
      "TSUMO_SASS_IMPLEMENTATION_INVALID",
      `Unsupported Sass implementation '${implementation}'; expected 'dart-sass' or 'libsass'`,
    );
  }
  const workDirectory = Path.Combine(
    Path.GetTempPath(),
    `tsumo-sass-${Guid.NewGuid().ToString("n")}`,
  );
  Directory.CreateDirectory(workDirectory);

  try {
    const inputPath = Path.Combine(workDirectory, "input.scss");
    const outputPath = Path.Combine(workDirectory, "output.css");
    File.WriteAllText(inputPath, sourceText);

    const argumentsList: string[] = implementation === "dart-sass"
      ? ["--no-source-map", "--style", "expanded"]
      : ["-t", "expanded"];
    for (let index = 0; index < loadPaths.length; index++) {
      const loadPath = loadPaths[index]!;
      if (!Directory.Exists(loadPath)) continue;
      argumentsList.push(implementation === "dart-sass" ? "--load-path" : "-I");
      argumentsList.push(loadPath);
    }
    argumentsList.push(inputPath);
    argumentsList.push(outputPath);

    const process = runExternalProcess(executable, argumentsList, "Sass compiler", "TSUMO_SASS_START_FAILED");
    if (process.exitCode !== 0) {
      const stderr = process.standardError;
      throw createTsumoError(
        "TSUMO_SASS_FAILED",
        stderr === "" ? `Sass compiler failed with exit code ${process.exitCode}` : stderr,
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
