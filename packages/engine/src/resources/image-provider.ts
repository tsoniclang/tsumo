import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { Guid } from "@tsonic/dotnet/System.js";
import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import type { int32 } from "@tsonic/core/types.js";
import { CodecManager, MagicImageProcessor, ProcessImageSettings } from "@tsonic/dotnet/PhotoSauce.MagicScaler.js";
import type { CodecCollection } from "@tsonic/dotnet/PhotoSauce.MagicScaler.js";
import { CodecCollectionExtensions as GiflibCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Giflib.js";
import { CodecCollectionExtensions as LibjpegCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libjpeg.js";
import { CodecCollectionExtensions as LibpngCodecs } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libpng.js";
import { WebpCodec } from "@tsonic/dotnet/PhotoSauce.NativeCodecs.Libwebp.js";
import { createTsumoError } from "../diagnostics.js";
import { parseInt32 } from "../utils/int32.js";
import { parseImageDimensions } from "./image-dimensions.js";
import { resourceMediaTypeForExtension } from "./media-types.js";
import { Resource, ResourceData } from "./models.js";
import { splitResourceFileName, splitResourcePath } from "./paths.js";

let imageCodecsRegistered = false;

const ensureImageCodecsRegistered = (): void => {
  if (imageCodecsRegistered) return;
  CodecManager.Configure((codecs: CodecCollection) => {
    LibpngCodecs.UseLibpng(codecs, true);
    LibjpegCodecs.UseLibjpeg(codecs, true);
    GiflibCodecs.UseGiflib(codecs, true);
    WebpCodec.UseLibwebp(codecs, true);
  });
  imageCodecsRegistered = true;
};

class ImageResizeRequest {
  width: int32;
  height: int32;
  format: string | undefined;

  constructor(width: int32, height: int32, format: string | undefined) {
    this.width = width;
    this.height = height;
    this.format = format;
  }
}

const parsePositiveDimension = (value: string, spec: string): int32 => {
  if (value === "") return 0;
  const parsed = parseInt32(value);
  if (parsed === undefined || parsed <= 0) {
    throw createTsumoError("TSUMO_IMAGE_RESIZE_SPEC_INVALID", `Invalid image resize specification: ${spec}`);
  }
  return parsed;
};

const parseImageResizeRequest = (spec: string): ImageResizeRequest => {
  const tokens = spec.trim().toLowerCase().split(" ").filter((token: string) => token !== "");
  if (tokens.length === 0) {
    throw createTsumoError("TSUMO_IMAGE_RESIZE_SPEC_INVALID", "Image resize specification cannot be empty");
  }

  const dimensions = tokens[0]!;
  const separator = dimensions.indexOf("x");
  let width: int32;
  let height: int32;
  if (separator < 0) {
    width = parsePositiveDimension(dimensions, spec);
    height = 0;
  } else {
    width = parsePositiveDimension(dimensions.slice(0, separator), spec);
    height = parsePositiveDimension(dimensions.slice(separator + 1), spec);
  }
  if (width === 0 && height === 0) {
    throw createTsumoError("TSUMO_IMAGE_RESIZE_SPEC_INVALID", `Invalid image resize specification: ${spec}`);
  }

  let format: string | undefined = undefined;
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token === "jpg" || token === "jpeg" || token === "png" || token === "gif" || token === "webp") {
      if (format !== undefined) {
        throw createTsumoError("TSUMO_IMAGE_RESIZE_SPEC_INVALID", `Image resize format is specified more than once: ${spec}`);
      }
      format = token === "jpeg" ? "jpg" : token;
      continue;
    }
    throw createTsumoError("TSUMO_IMAGE_RESIZE_OPTION_UNSUPPORTED", `Unsupported image resize option '${token}'`);
  }
  return new ImageResizeRequest(width, height, format);
};

export const resizeImageResource = (resource: Resource, specification: string): Resource => {
  const request = parseImageResizeRequest(specification);
  let width: int32 = request.width;
  let height: int32 = request.height;
  if (width === 0 && resource.width > 0 && resource.height > 0) {
    width = (resource.width * height) / resource.height;
  } else if (height === 0 && resource.width > 0 && resource.height > 0) {
    height = (resource.height * width) / resource.width;
  }
  if (width <= 0 || height <= 0) {
    throw createTsumoError(
      "TSUMO_IMAGE_DIMENSIONS_UNKNOWN",
      "Image resizing with one automatic dimension requires known source dimensions",
    );
  }

  const sourceName = resource.outputRelPath ?? resource.sourcePath ?? "";
  const sourceExtension = (Path.GetExtension(sourceName) ?? "").toLowerCase();
  if (sourceExtension === "") {
    throw createTsumoError("TSUMO_IMAGE_FORMAT_UNKNOWN", "Image resizing requires a source file format");
  }
  const outputExtension = request.format === undefined ? sourceExtension : `.${request.format}`;
  const workDirectory = Path.Combine(
    Path.GetTempPath(),
    `tsumo-image-${Guid.NewGuid().ToString("n")}`,
  );
  Directory.CreateDirectory(workDirectory);

  try {
    const inputPath = Path.Combine(workDirectory, "input" + sourceExtension);
    const outputPath = Path.Combine(workDirectory, "output" + outputExtension);
    writeFileSync(inputPath, resource.bytes);
    ensureImageCodecsRegistered();
    const settings = new ProcessImageSettings();
    settings.Width = width;
    settings.Height = height;
    if (request.format !== undefined) settings.TrySetEncoderFormat(outputExtension);
    MagicImageProcessor.ProcessImage(inputPath, outputPath, settings);

    const outputBytes = readFileSync(outputPath);
    let outputWidth: int32 = width;
    let outputHeight: int32 = height;
    const dimensions = parseImageDimensions(outputBytes);
    if (dimensions !== undefined) {
      outputWidth = dimensions.width;
      outputHeight = dimensions.height;
    }

    const outputRelPath = resource.outputRelPath ?? "";
    const path = splitResourcePath(outputRelPath);
    const file = splitResourceFileName(path.fileName);
    const outputFile = `${file.baseName}_${outputWidth}x${outputHeight}${outputExtension}`;
    return new Resource(
      `${resource.id}|resize:${specification}`,
      undefined,
      true,
      path.directory + outputFile,
      outputBytes,
      undefined,
      new ResourceData(""),
      resourceMediaTypeForExtension(outputExtension),
      outputWidth,
      outputHeight,
    );
  } finally {
    if (Directory.Exists(workDirectory)) Directory.Delete(workDirectory, true);
  }
};
