import {
  MissingRequiredClientCapabilityError,
  OAuthError,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import type { McpFailurePhase } from '../../shared/types';

/** A connect error together with the step that failed. */
export class McpConnectError extends Error {
  constructor(readonly phase: McpFailurePhase, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'McpConnectError';
  }
}

function* errorChain(error: unknown): Generator<unknown> {
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    yield current;
    current = current instanceof Error ? current.cause : undefined;
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  for (const item of errorChain(error)) {
    if (item instanceof UnauthorizedError) return true;
  }
  return false;
}

export function isAuthError(error: unknown): boolean {
  for (const item of errorChain(error)) {
    if (item instanceof UnauthorizedError || item instanceof OAuthError) return true;
    if (item instanceof SdkHttpError && (item.status === 401 || item.status === 403)) return true;
    if (item instanceof SdkError
      && (item.code === SdkErrorCode.ClientHttpAuthentication || item.code === SdkErrorCode.ClientHttpForbidden)) return true;
  }
  return false;
}

/** Names the step that failed. `fallback` is the connect step that was running. */
export function failurePhaseOf(error: unknown, fallback: McpFailurePhase): McpFailurePhase {
  for (const item of errorChain(error)) {
    if (item instanceof McpConnectError) return item.phase;
  }
  if (isAuthError(error)) return 'auth';
  for (const item of errorChain(error)) {
    if (item instanceof MissingRequiredClientCapabilityError) return 'extension';
    if (item instanceof SdkError && item.code === SdkErrorCode.EraNegotiationFailed) return 'discovery';
  }
  return fallback;
}
