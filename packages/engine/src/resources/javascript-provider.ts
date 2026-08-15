import { Buffer } from "node:buffer";
import { Environment, Guid } from "@tsonic/dotnet/System.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { createTsumoError } from "../diagnostics.js";
import { Resource } from "./models.js";
import { runExternalProcess } from "./external-process.js";
import { splitResourceFileName, splitResourcePath } from "./paths.js";
import { readResourceText } from "./text.js";

const cacheKeyPart = (value: string): string => `${value.length}:${value}`;

export class JavaScriptBuildOptions {
  targetPath: string | undefined;
  minify: boolean;
  format: string;
  target: string;
  platform: string;
  sourceMap: string;
  paramsJson: string | undefined;
  jsxFactory: string | undefined;

  constructor() {
    this.targetPath = undefined;
    this.minify = false;
    this.format = "iife";
    this.target = "esnext";
    this.platform = "browser";
    this.sourceMap = "none";
    this.paramsJson = undefined;
    this.jsxFactory = undefined;
  }

  cacheKey(): string {
    const values = [
      this.targetPath ?? "",
      this.minify ? "1" : "0",
      this.format,
      this.target,
      this.platform,
      this.sourceMap,
      this.paramsJson ?? "",
      this.jsxFactory ?? "",
    ];
    let result = "";
    for (let index = 0; index < values.length; index++) {
      result += cacheKeyPart(values[index]!);
    }
    return result;
  }
}

const sourceExtension = (resource: Resource): string => {
  const raw = resource.outputRelPath ?? resource.sourcePath ?? "input.js";
  const extension = splitResourceFileName(splitResourcePath(raw).fileName).extension.toLowerCase();
  if (extension === ".ts" || extension === ".tsx" || extension === ".jsx") return extension;
  return ".js";
};

const outputRelativePath = (resource: Resource, options: JavaScriptBuildOptions): string => {
  const raw = options.targetPath ?? resource.outputRelPath ?? "script.js";
  const path = splitResourcePath(raw);
  const file = splitResourceFileName(path.fileName);
  return path.directory + file.baseName + ".js";
};

export const buildJavaScriptResource = (
  resource: Resource,
  options: JavaScriptBuildOptions,
): Resource => {
  const sourceText = readResourceText(resource, "js.Build");
  if (options.sourceMap !== "none") {
    throw createTsumoError(
      "TSUMO_JAVASCRIPT_SOURCE_MAP_UNSUPPORTED",
      "js.Build currently supports only sourceMap 'none'",
    );
  }

  const configuredExecutable = Environment.GetEnvironmentVariable("TSUMO_ESBUILD");
  const executable = configuredExecutable !== undefined && configuredExecutable.trim() !== ""
    ? configuredExecutable.trim()
    : "esbuild";
  const workDirectory = Path.Combine(
    Path.GetTempPath(),
    `tsumo-esbuild-${Guid.NewGuid().ToString("n")}`,
  );
  Directory.CreateDirectory(workDirectory);

  try {
    let inputPath = Path.Combine(workDirectory, "input" + sourceExtension(resource));
    const sourcePath = resource.sourcePath;
    if (sourcePath !== undefined && File.Exists(sourcePath) && File.ReadAllText(sourcePath) === sourceText) {
      inputPath = sourcePath;
    } else {
      File.WriteAllText(inputPath, sourceText);
    }
    const outputPath = Path.Combine(workDirectory, "output.js");
    const argumentsList: string[] = [
      inputPath,
      "--bundle",
      `--outfile=${outputPath}`,
      `--format=${options.format}`,
      `--target=${options.target}`,
      `--platform=${options.platform}`,
      "--charset=utf8",
      "--log-level=warning",
    ];
    if (options.minify) argumentsList.push("--minify");
    const jsxFactory = options.jsxFactory;
    if (jsxFactory !== undefined) argumentsList.push(`--jsx-factory=${jsxFactory}`);
    const paramsJson = options.paramsJson;
    if (paramsJson !== undefined) {
      const paramsPath = Path.Combine(workDirectory, "params.json");
      File.WriteAllText(paramsPath, paramsJson);
      argumentsList.push(`--alias:@params=${paramsPath}`);
    }

    const process = runExternalProcess(executable, argumentsList, "esbuild", "TSUMO_ESBUILD_START_FAILED");
    if (process.exitCode !== 0) {
      throw createTsumoError(
        "TSUMO_ESBUILD_FAILED",
        process.standardError === "" ? `esbuild failed with exit code ${process.exitCode}` : process.standardError,
      );
    }
    if (!File.Exists(outputPath)) {
      throw createTsumoError("TSUMO_ESBUILD_OUTPUT_MISSING", "esbuild completed without producing JavaScript");
    }

    const text = File.ReadAllText(outputPath);
    return new Resource(
      `${resource.id}|js-build:${options.cacheKey()}`,
      resource.sourcePath,
      true,
      outputRelativePath(resource, options),
      Buffer.from(text, "utf8"),
      text,
      resource.Data,
      "application/javascript",
    );
  } finally {
    if (Directory.Exists(workDirectory)) Directory.Delete(workDirectory, true);
  }
};
