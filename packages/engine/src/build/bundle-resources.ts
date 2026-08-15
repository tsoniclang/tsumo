import { discoverPageBundleResourceFiles } from "../resources/page-bundle.js";
import { SiteOutputPlan } from "./output-plan.js";

export const addBundleResources = (
  sourceDir: string,
  outputPrefix: string,
  owner: string,
  outputPlan: SiteOutputPlan,
): void => {
  const files = discoverPageBundleResourceFiles(sourceDir);
  for (let index = 0; index < files.length; index++) {
    const file = files[index]!;
    const outputPath = outputPrefix === "" ? file.relativePath : `${outputPrefix}/${file.relativePath}`;
    outputPlan.addAsset(outputPath, file.sourcePath, owner, "bundle");
  }
};
