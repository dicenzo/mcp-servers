#!/usr/bin/env node

/**
 * Executable entry point. The server itself lives in server.ts so it can be
 * imported (by tests or other code) without starting a stdio server; this
 * file only starts it when run directly.
 */
import { main } from './server.js';

export { MCPColorServer, main } from './server.js';

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[FATAL ERROR]', error);
    process.exit(1);
  });
}
