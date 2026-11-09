/**
 * Setup waits in the tool check measure how long a development server or a
 * browser takes to come up, not how the product behaves. Windows CI runners
 * take roughly twice as long at process and port setup, so those budgets are
 * scaled there instead of being widened everywhere.
 */
const SLOW_PLATFORM_FACTOR = process.platform === 'win32' ? 2 : 1;

export function setupTimeout(milliseconds: number): number {
  return milliseconds * SLOW_PLATFORM_FACTOR;
}
