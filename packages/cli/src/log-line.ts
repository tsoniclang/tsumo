import { Console } from "@tsonic/dotnet/System.js";

export const logLine = (message: string): void => {
  Console.WriteLine("{0}", message);
};

