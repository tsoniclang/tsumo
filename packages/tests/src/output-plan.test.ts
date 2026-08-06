import { attribute } from "@tsonic/core/lang.js";
import { Directory, File, Path } from "@tsonic/dotnet/System.IO.js";
import { Exception } from "@tsonic/dotnet/System.js";
import { Assert, FactAttribute } from "@tsonic/dotnet/Xunit.js";
import { SiteOutputPlan, TsumoError } from "@tsumo/engine/testing.js";
import { createTestDirectory, deleteTestDirectory } from "./test-root.js";

const captureOutputDiagnostic = (operation: () => void): string => {
  try {
    operation();
  } catch (error) {
    if (error instanceof TsumoError) return error.diagnostic.code;
    throw error;
  }
  throw new Exception("Expected an output-plan diagnostic");
};

export class OutputPlanTests {
  paths_and_collisions_fail_before_rendering(): void {
    const plan = new SiteOutputPlan();
    Assert.Equal(
      "TSUMO_OUTPUT_PATH_ESCAPES_ROOT",
      captureOutputDiagnostic(() => {
        plan.addText("../outside.html", "outside", "escape");
      }),
    );
    plan.addText("pages/index.html", "first", "first page");
    Assert.Equal(
      "TSUMO_OUTPUT_PATH_CONFLICT",
      captureOutputDiagnostic(() => {
        plan.addText("PAGES/index.html", "second", "second page");
      }),
    );
  }

  static_layers_have_one_explicit_precedence_policy(): void {
    const root = createTestDirectory("output-plan-static");
    const theme = Path.Combine(root, "theme");
    const site = Path.Combine(root, "site");
    const output = Path.Combine(root, "output");
    try {
      Directory.CreateDirectory(theme);
      Directory.CreateDirectory(site);
      File.WriteAllText(Path.Combine(theme, "style.css"), "theme");
      File.WriteAllText(Path.Combine(theme, "robots.txt"), "theme robots");
      File.WriteAllText(Path.Combine(site, "style.css"), "site");
      File.WriteAllText(Path.Combine(site, "robots.txt"), "site robots");

      const plan = new SiteOutputPlan();
      plan.addDirectory(theme, "", "theme static", "theme-static");
      plan.addDirectory(site, "", "site static", "site-static");
      plan.addDefaultText("robots.txt", "generated robots", "generated robots");
      plan.addText("index.html", "home", "home");
      Assert.Equal(1, plan.generatedOutputCount());
      plan.render(output);

      Assert.Equal("site", File.ReadAllText(Path.Combine(output, "style.css")));
      Assert.Equal("site robots", File.ReadAllText(Path.Combine(output, "robots.txt")));
      Assert.Equal("home", File.ReadAllText(Path.Combine(output, "index.html")));
    } finally {
      deleteTestDirectory(root);
    }
  }

  bundle_assets_cannot_overwrite_generated_routes(): void {
    const root = createTestDirectory("output-plan-bundle");
    try {
      const asset = Path.Combine(root, "index.html");
      File.WriteAllText(asset, "asset");
      const plan = new SiteOutputPlan();
      plan.addText("index.html", "generated", "home");
      Assert.Equal(
        "TSUMO_OUTPUT_PATH_CONFLICT",
        captureOutputDiagnostic(() => {
          plan.addAsset("index.html", asset, "bundle", "bundle");
        }),
      );
    } finally {
      deleteTestDirectory(root);
    }
  }
}

attribute<OutputPlanTests>().method((target) => target.paths_and_collisions_fail_before_rendering).add(FactAttribute);
attribute<OutputPlanTests>().method((target) => target.static_layers_have_one_explicit_precedence_policy).add(FactAttribute);
attribute<OutputPlanTests>().method((target) => target.bundle_assets_cannot_overwrite_generated_routes).add(FactAttribute);
