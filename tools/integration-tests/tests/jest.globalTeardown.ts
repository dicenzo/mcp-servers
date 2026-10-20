/**
 * Global teardown for integration tests
 * Cleanup any remaining processes or files
 */

export default async function globalTeardown(): Promise<void> {
  console.log('[Global Teardown] Cleaning up integration test environment...');
  
  // Clean up any hanging processes
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  
  console.log('[Global Teardown] ✓ Cleanup complete');
}