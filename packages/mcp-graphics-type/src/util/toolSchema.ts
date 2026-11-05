import { z } from 'zod';

/** The JSON Schema an MCP tool advertises as its `inputSchema` */
export type ToolInputSchema = { type: 'object'; [key: string]: unknown };

type JsonSchema = Record<string, unknown>;

/**
 * Generates a tool's MCP `inputSchema` from the zod schema its handler validates
 * with, so the advertised types, limits, defaults and descriptions can't drift
 * from what is enforced. `io: 'input'` describes what callers may send: fields
 * with defaults are optional. Refinements can't be expressed and are left out.
 *
 * Two adjustments keep the result usable as a tool schema:
 * - Union members that only in-process callers can pass (`z.instanceof(Buffer)`)
 *   are left out, since JSON arguments can't carry them.
 * - A top-level union of objects (type.loadFont's font input) is flattened into
 *   one object, because clients and model APIs require an object at the top
 *   and many reject a top-level anyOf. zod still validates the strict union.
 */
export function toolInputSchema(schema: z.ZodType): ToolInputSchema {
  const json: JsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      const def = zodSchema._zod.def;
      if (def.type !== 'union' || !Array.isArray(jsonSchema.anyOf)) {
        return;
      }
      const kept = jsonSchema.anyOf.filter((_member, i) => def.options[i]?._zod.def.type !== 'custom');
      if (kept.length === 1) {
        delete jsonSchema.anyOf;
        Object.assign(jsonSchema, kept[0]);
      } else {
        jsonSchema.anyOf = kept;
      }
    },
    // The custom members are dropped above; this only stops zod throwing on them first
    unrepresentable: 'any'
  });
  // MCP assumes JSON Schema 2020-12, which is what zod writes, so drop the marker
  delete json.$schema;
  const result = Array.isArray(json.anyOf) ? flattenObjectUnion(json) : json;
  if (result.type !== 'object') {
    throw new Error('A tool input schema must describe an object');
  }
  return result as ToolInputSchema;
}

/**
 * Merges a union of object schemas into one object: every property of every
 * member, with a member's `const` discriminators combined into an `enum`, and
 * only the properties every member requires left required.
 */
function flattenObjectUnion(json: JsonSchema): JsonSchema {
  const members = json.anyOf as JsonSchema[];
  if (!members.every(member => member.type === 'object')) {
    return json;
  }
  const properties: Record<string, JsonSchema> = {};
  for (const member of members) {
    for (const [key, property] of Object.entries((member.properties ?? {}) as Record<string, JsonSchema>)) {
      const existing = properties[key];
      if (existing === undefined) {
        properties[key] = { ...property };
      } else if (existing.const !== undefined || existing.enum !== undefined) {
        const values = [...((existing.enum as unknown[]) ?? [existing.const])];
        const added = property.const !== undefined ? [property.const] : ((property.enum as unknown[]) ?? []);
        for (const value of added) {
          if (!values.includes(value)) {
            values.push(value);
          }
        }
        delete existing.const;
        existing.enum = values;
      }
    }
  }
  const requiredByAll = members
    .map(member => (member.required ?? []) as string[])
    .reduce((common, required) => common.filter(key => required.includes(key)));
  const flat: JsonSchema = { ...json, type: 'object', properties, required: requiredByAll };
  delete flat.anyOf;
  return flat;
}
