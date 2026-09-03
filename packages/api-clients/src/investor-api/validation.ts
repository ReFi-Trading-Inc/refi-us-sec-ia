/**
 * Runtime validation against the vendored `schemas.json`.
 *
 * `schemas.json` is JSON Schema **2020-12** (closed objects, `$defs`,
 * `if/then/else`). It must be compiled with Ajv's 2020-12 class, not the
 * default draft-07 instance, or those keywords would be silently downgraded.
 *
 * An unknown field, enum value, Record variant or SSE variant is a
 * contract-version mismatch and surfaces as `ContractVersionMismatchError`;
 * it is never ignored.
 */
import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schemas from "../../contracts/investor-api/v1.1.0-alpha.2/schemas.json";
import { ContractVersionMismatchError } from "./errors";

// schemas.json carries its own `$id`; Ajv indexes it under that URI.
const SCHEMA_KEY = schemas.$id;

const ajv = new Ajv2020({
  allErrors: true,
  // strictSchema stays on (unknown keywords are errors). strictTypes is off
  // because Daniel's `if/then` branches constrain `maxItems` without
  // restating `type` — valid 2020-12, but Ajv's strict-types heuristic flags it.
  strict: true,
  strictTypes: false,
  // PreferencePatch is `anyOf` over required-one-of properties declared on the
  // parent; Ajv's strictRequired heuristic cannot see that. Same reasoning.
  strictRequired: false,
  allowUnionTypes: true,
});
addFormats(ajv);
ajv.addSchema(schemas);

const compiled = new Map<string, ValidateFunction>();

export type SchemaName = keyof (typeof schemas)["$defs"];

export function hasSchema(name: string): name is SchemaName {
  return Object.prototype.hasOwnProperty.call(schemas.$defs, name);
}

function validatorFor(name: SchemaName): ValidateFunction {
  const existing = compiled.get(name);
  if (existing) return existing;
  const fn = ajv.getSchema(`${SCHEMA_KEY}#/$defs/${name}`);
  if (!fn) {
    throw new Error(`Contract schema "${name}" is not in schemas.json`);
  }
  compiled.set(name, fn);
  return fn;
}

function describe(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) return ["unknown validation failure"];
  return errors.map((e) => {
    const where = e.instancePath || "/";
    const extra =
      e.keyword === "additionalProperties" &&
      typeof e.params["additionalProperty"] === "string"
        ? ` (${e.params["additionalProperty"]})`
        : "";
    return `${where} ${e.message ?? e.keyword}${extra}`;
  });
}

/** Returns the list of problems (empty when valid). Never throws on invalid data. */
export function problemsAgainst(name: SchemaName, value: unknown): string[] {
  const fn = validatorFor(name);
  return fn(value) ? [] : describe(fn.errors);
}

/** Throws `ContractVersionMismatchError` when `value` does not match `name`. */
export function assertMatches(
  name: SchemaName,
  value: unknown,
  direction: "request" | "response",
): void {
  const problems = problemsAgainst(name, value);
  if (problems.length) {
    throw new ContractVersionMismatchError(name, direction, problems);
  }
}
