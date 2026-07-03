/**
 * Small durable state for event source adapters (webhook port + hook secrets,
 * GitHub cursors), one JSON file per namespace under the orchestrator state
 * dir (`events/<namespace>.json`), persisted through the host artifact store —
 * no new host seam, same containment guarantees.
 */

import type { OrchestratorHost } from '../host';

function adapterStatePath(namespace: string): string {
  return `events/${namespace}.json`;
}

export async function readAdapterState<T>(host: OrchestratorHost, namespace: string): Promise<T | null> {
  const raw = await host.readArtifact(adapterStatePath(namespace));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    host.log(`events: ignoring corrupt adapter state for "${namespace}"`);
    return null;
  }
}

export async function writeAdapterState<T>(host: OrchestratorHost, namespace: string, state: T): Promise<void> {
  await host.writeArtifact(adapterStatePath(namespace), JSON.stringify(state, null, 2));
}
