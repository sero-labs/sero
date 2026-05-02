const INVALID_AUTH_TOKEN_RE = /invalid authentication token/i;

export function isInvalidAuthTokenMessage(message: string): boolean {
  return INVALID_AUTH_TOKEN_RE.test(message);
}

export function shouldReconnectAfterConnectError(message: string): boolean {
  return !isInvalidAuthTokenMessage(message);
}
