import { z } from 'zod';

/** The JSON Schema an MCP tool advertises as its `inputSchema` */
export type ToolInputSchema = { type: 'object'; [key: string]: unknown };

/**
 * Generates a tool's MCP `inputSchema` from the zod schema its handler validates
 * with, so the advertised types, limits, defaults and descriptions can't drift
 * from what is enforced. `io: 'input'` describes what callers may send: fields
 * with defaults are optional. Refinements can't be expressed and are left out.
 */
export function toolInputSchema(schema: z.ZodType): ToolInputSchema {
  const json = z.toJSONSchema(schema, { io: 'input' });
  // MCP assumes JSON Schema 2020-12, which is what zod writes, so drop the marker
  delete json.$schema;
  if (json.type !== 'object') {
    throw new Error('A tool input schema must describe an object');
  }
  return json as ToolInputSchema;
}
