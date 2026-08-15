import type { int32 } from "@tsonic/core/types.js";
import { createTsumoError } from "../../diagnostics.js";
import { PageContext } from "../../models.js";
import { parseInt32, toInt32 } from "../../utils/int32.js";
import {
  AnyArrayValue, NumberValue, PageArrayValue, StringArrayValue, StringValue, TemplateValue,
} from "../values.js";

const maxSequenceSize: int32 = 1_000_000;

const sequenceArgument = (value: TemplateValue, position: int32): int32 => {
  if (value instanceof NumberValue) return value.value;
  if (value instanceof StringValue) {
    const parsed = parseInt32(value.value);
    if (parsed !== undefined) return parsed;
  }
  throw createTsumoError(
    "TSUMO_TEMPLATE_SEQUENCE_ARGUMENT_INVALID",
    `seq argument ${position} must be a 32-bit integer`,
  );
};

export const createIntegerSequence = (args: TemplateValue[]): AnyArrayValue => {
  if (args.length < 1 || args.length > 3) {
    throw createTsumoError(
      "TSUMO_TEMPLATE_SEQUENCE_ARGUMENT_INVALID",
      "seq requires one, two, or three integer arguments",
    );
  }

  let first = sequenceArgument(args[0]!, 1);
  let increment: int32 = 1;
  let last = first;

  if (args.length === 1) {
    if (last === 0) return new AnyArrayValue([]);
    if (last > 0) {
      first = 1;
    } else {
      first = -1;
      increment = -1;
    }
  } else {
    last = sequenceArgument(args[args.length - 1]!, args.length as int32);
    if (args.length === 2) {
      if (last < first) increment = -1;
    } else {
      increment = sequenceArgument(args[1]!, 2);
      if (increment === 0 || (first < last && increment < 0) || (first > last && increment > 0)) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_SEQUENCE_INCREMENT_INVALID",
          "seq increment must be non-zero and move from the first value toward the last value",
        );
      }
    }
  }

  const difference: number = last - first;
  const sizeValue: number = Math.floor(difference / increment) + 1;
  const size = toInt32(sizeValue);
  if (size === undefined || size <= 0 || size > maxSequenceSize) {
    throw createTsumoError(
      "TSUMO_TEMPLATE_SEQUENCE_SIZE_UNSUPPORTED",
      `seq cannot produce more than ${maxSequenceSize} values`,
    );
  }

  const values: TemplateValue[] = [];
  let value = first;
  for (let index: int32 = 0; index < size; index++) {
    values.push(new NumberValue(value));
    if (index + 1 < size) {
      const next = toInt32(value + increment);
      if (next === undefined) {
        throw createTsumoError(
          "TSUMO_TEMPLATE_SEQUENCE_SIZE_UNSUPPORTED",
          "seq result exceeds the supported 32-bit integer range",
        );
      }
      value = next;
    }
  }
  return new AnyArrayValue(values);
};

export const reverseTemplateCollection = (collection: TemplateValue): TemplateValue | undefined => {
  if (collection instanceof AnyArrayValue) {
    const result: TemplateValue[] = [];
    for (let index = collection.value.length - 1; index >= 0; index--) result.push(collection.value[index]!);
    return new AnyArrayValue(result);
  }
  if (collection instanceof StringArrayValue) {
    const result: string[] = [];
    for (let index = collection.value.length - 1; index >= 0; index--) result.push(collection.value[index]!);
    return new StringArrayValue(result);
  }
  if (collection instanceof PageArrayValue) {
    const result: PageContext[] = [];
    for (let index = collection.value.length - 1; index >= 0; index--) result.push(collection.value[index]!);
    return new PageArrayValue(result);
  }
  return undefined;
};
