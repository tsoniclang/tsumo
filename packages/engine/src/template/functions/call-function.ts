import { Console } from "@tsonic/dotnet/System.js";
import { createTsumoError } from "../../diagnostics.js";
import type { TemplateEnvironment } from "../environment.js";
import type { TemplateNode } from "../nodes.js";
import type { RenderScope } from "../scope.js";
import type { TemplateValue } from "../values.js";
import { TemplateReturnSignal } from "../evaluation/return-signal.js";
import { callCollectionFunction } from "./collection-functions.js";
import { callContextFunction } from "./context-functions.js";
import { TemplateFunctionContext } from "./function-context.js";
import { isKnownTemplateFunction } from "./function-registry.js";
import { callResourceFunction } from "./resource-functions.js";
import { callScalarFunction } from "./scalar-functions.js";
import { callTemplateFunctionFamily } from "./template-functions.js";

export const callTemplateFunction = (
  nameRaw: string,
  args: TemplateValue[],
  scope: RenderScope,
  environment: TemplateEnvironment,
  overrides: Map<string, TemplateNode[]>,
  defines: Map<string, TemplateNode[]>,
): TemplateValue => {
  const name = nameRaw.trim().toLowerCase();
  const context = new TemplateFunctionContext(scope, environment, overrides, defines);
  try {
    let result = callContextFunction(nameRaw, name, args, context);
    if (result !== undefined) return result;
    result = callResourceFunction(name, args, context);
    if (result !== undefined) return result;
    result = callTemplateFunctionFamily(name, args, context);
    if (result !== undefined) return result;
    result = callCollectionFunction(name, args, context);
    if (result !== undefined) return result;
    result = callScalarFunction(name, args, context);
    if (result !== undefined) return result;

    if (isKnownTemplateFunction(name)) {
      throw createTsumoError(
        "TSUMO_TEMPLATE_FUNCTION_ARGUMENTS_INVALID",
        `Template function '${nameRaw}' does not accept the supplied arguments`,
      );
    }
    throw createTsumoError("TSUMO_TEMPLATE_UNKNOWN_FUNCTION", `Unknown template function: ${nameRaw}`);
  } catch (error) {
    if (error instanceof TemplateReturnSignal) throw error;
    Console.Error.WriteLine("Template function failed: {0} ({1})", nameRaw, name);
    throw error;
  }
};
