import { Directory, Path } from "@tsonic/dotnet/System.IO.js";
import { Environment, Exception, Guid } from "@tsonic/dotnet/System.js";

export const createTestDirectory = (name: string): string => {
  const configuredRoot = Environment.GetEnvironmentVariable("TSUMO_TEST_ROOT");
  if (configuredRoot === undefined || configuredRoot.trim() === "") {
    throw new Exception("TSUMO_TEST_ROOT must name the test-owned scratch directory");
  }
  const root = Path.GetFullPath(configuredRoot);
  Directory.CreateDirectory(root);
  const testDirectory = Path.Combine(root, `${name}-${Guid.NewGuid().ToString("n")}`);
  Directory.CreateDirectory(testDirectory);
  return testDirectory;
};

export const deleteTestDirectory = (path: string): void => {
  if (Directory.Exists(path)) Directory.Delete(path, true);
};
