/**
 * RTK toolchain contract shared by the host and agent extensions.
 *
 * Agent extensions run in the Electron main process without a runtime or
 * container handle. They ask the host for the resolved RTK executable over the
 * Pi EventBus, using the same request/response shape as the agent-plugin MCP
 * sources channel.
 */

/** EventBus channel for an RTK resolution request. */
export const RTK_TOOLCHAIN_EVENT = 'sero:rtk-toolchain';

/**
 * Paths and environment for one execution location.
 *
 * `env` holds the session-scoped RTK tracking and recovery locations. An
 * invoking extension applies it to every inserted RTK invocation.
 */
export interface RtkToolchainLocation {
  /** Absolute path of the verified RTK executable at this location. */
  executablePath: string;
  /** Environment assignments that keep RTK writes inside session state. */
  env: Record<string, string>;
}

export type RtkToolchainState = 'available' | 'installing' | 'failed';

export interface RtkToolchainResolution {
  state: RtkToolchainState;
  /** Verified version. Present only when `state` is `available`. */
  version?: string;
  /** Host-side location for probes. Present only when `state` is `available`. */
  host?: RtkToolchainLocation;
  /** Location where the session's commands execute. */
  runtime?: RtkToolchainLocation;
  /** Why RTK is unavailable. Present when `state` is not `available`. */
  reason?: string;
}

export interface RtkToolchainRequest {
  /** Session that will use the resolved executable. */
  sessionId: string;
  /** Workspace whose runtime executes rewritten commands. */
  workspaceId: string;
  /** Confirms that a host handler accepted the request. */
  accept(): void;
  resolve(result: RtkToolchainResolution): void;
}
