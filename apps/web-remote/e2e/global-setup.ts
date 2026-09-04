/**
 * Starts the gateway stand-in for the whole visual run, and stops it
 * again at the end.
 */

import { startTestGateway, type TestGateway } from './fixtures/gateway';

/** The port the app's client is pointed at by `VITE_GATEWAY_URL`. */
export const GATEWAY_PORT = 18899;

let gateway: TestGateway | null = null;

export default async function globalSetup(): Promise<() => Promise<void>> {
  gateway = await startTestGateway(GATEWAY_PORT);

  return async () => {
    await gateway?.close();
    gateway = null;
  };
}
