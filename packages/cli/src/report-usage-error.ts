import process from "node:process";

import { logErrorLine } from "./log-error-line.js";

export const reportUsageError = (message: string): void => {
  logErrorLine(message);
  process.exitCode = 2;
};
