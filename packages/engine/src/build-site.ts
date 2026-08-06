import { Path } from "@tsonic/dotnet/System.IO.js";
import { BuildRequest, BuildResult } from "./models.js";
import { loadDocsConfig } from "./docs/config.js";
import { buildDocsSite } from "./docs/builder.js";
import { beginOutputPublication } from "./output-publication.js";
import { buildStandardSite } from "./build/standard-site.js";

export const buildSite = (request: BuildRequest): BuildResult => {
  const siteDir = Path.GetFullPath(request.siteDir);
  const docs = loadDocsConfig(siteDir);
  const publication = beginOutputPublication(
    siteDir,
    request.destinationDir,
    !request.cleanDestinationDir,
  );
  try {
    const pagesBuilt = docs === undefined
      ? buildStandardSite(request, siteDir, publication.stagingDir)
      : buildDocsSite(request, docs, publication.stagingDir);
    publication.publish();
    return new BuildResult(publication.destinationDir, pagesBuilt);
  } catch (error) {
    publication.abort();
    throw error;
  }
};
