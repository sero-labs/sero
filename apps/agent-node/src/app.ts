import { bootstrapProviders } from "./bootstrap.ts";
import { BlobStore } from "./blobs.ts";
import { ControllerStore } from "./controllers.ts";
import { EventHub } from "./events.ts";
import { createPiRunnerFactory, type SessionRunnerFactory } from "./pi-host.ts";
import { ProviderAuth } from "./provider-auth.ts";
import { SessionStore } from "./sessions.ts";
import { ensureState, identityFingerprint, type StatePaths } from "./state.ts";

export interface AppServices {
  paths: StatePaths; controllers: ControllerStore; sessions: SessionStore; providers: ProviderAuth;
  events: EventHub; blobs: BlobStore; fingerprint: string; providersAdvertised: string[];
}

export async function createApp(stateRoot: string, publicUrl: string, runnerFactory?: SessionRunnerFactory): Promise<AppServices> {
  const boot = await bootstrapProviders(stateRoot);
  const paths = await ensureState(stateRoot);
  process.env.SERO_AGENT_DIR = paths.root;
  const events = new EventHub();
  const sessions = new SessionStore(paths, events, runnerFactory ?? createPiRunnerFactory(paths));
  await sessions.recover();
  return {
    paths, events, sessions, controllers: new ControllerStore(paths),
    providers: new ProviderAuth(paths, events, boot.providers), blobs: new BlobStore(paths, publicUrl),
    fingerprint: await identityFingerprint(paths), providersAdvertised: boot.providers,
  };
}
