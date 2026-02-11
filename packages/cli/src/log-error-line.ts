import { Console } from "@tsonic/dotnet/System.js";

export const logErrorLine = (message: string): void => {
  Console.Error.WriteLine("{0}", message);
};

