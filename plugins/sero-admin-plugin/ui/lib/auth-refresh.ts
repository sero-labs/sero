import type { OAuthEventIPC } from '../hooks/host';

export function shouldRefreshForAuthEvent(event: Pick<OAuthEventIPC, 'type'>): boolean {
  return event.type === 'success' || event.type === 'error' || event.type === 'cancelled';
}
