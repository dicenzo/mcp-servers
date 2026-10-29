import { Tool } from '@modelcontextprotocol/sdk/types.js';

/** The single result every tool returns from its invoke generator. */
export interface ToolTextResult {
  type: 'text';
  text: string;
}

/**
 * The SDK's Tool type (1.17.4) describes only the tool's metadata. Our tools also carry an
 * `invoke` generator: src/index.ts calls it and reads the result from a single `next()`.
 */
export interface ExecutableTool extends Tool {
  invoke(args: unknown): AsyncGenerator<never, ToolTextResult, unknown>;
}
