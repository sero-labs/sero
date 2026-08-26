import { EventEmitter } from 'node:events';
import {
  Client,
  EnvHttpProxyAgent,
  Pool,
  install,
  setGlobalDispatcher,
  type Dispatcher,
} from 'undici';

const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2000;
const ignoreUndiciDispatcherError = () => {};
let activeDispatcher: EnvHttpProxyAgent | null = null;
let activeTimeoutMs: number | null = null;
let fetchInstalled = false;

function withErrorListener<T extends Dispatcher>(dispatcher: T): T {
  if (dispatcher instanceof EventEmitter) {
    EventEmitter.prototype.on.call(dispatcher, 'error', ignoreUndiciDispatcherError);
  }
  return dispatcher;
}

function createClient(origin: string | URL, options: object): Dispatcher {
  return withErrorListener(new Client(origin, options as Client.Options));
}

function createOriginDispatcher(origin: string | URL, options: object): Dispatcher {
  const poolOptions = options as Pool.Options;
  if (poolOptions.connections === 1) return createClient(origin, poolOptions);
  return withErrorListener(new Pool(origin, {
    ...poolOptions,
    factory: createClient,
  }));
}

/** Set the idle timeout for fetch requests made by the Electron main process. */
export function configureElectronFetch(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error(`Invalid HTTP idle timeout: ${String(timeoutMs)}`);
  }
  const normalizedTimeout = Math.floor(timeoutMs);
  if (activeTimeoutMs === normalizedTimeout) return;

  const dispatcher = withErrorListener(new EnvHttpProxyAgent({
    allowH2: false,
    bodyTimeout: normalizedTimeout,
    headersTimeout: normalizedTimeout,
    connect: {
      autoSelectFamilyAttemptTimeout: AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS,
    },
    clientFactory: createClient,
    factory: createOriginDispatcher,
  }));
  const previous = activeDispatcher;
  setGlobalDispatcher(dispatcher);
  if (!fetchInstalled) {
    install();
    fetchInstalled = true;
  }
  activeDispatcher = dispatcher;
  activeTimeoutMs = normalizedTimeout;
  if (previous) void previous.close().catch(ignoreUndiciDispatcherError);
}
