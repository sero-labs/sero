import { useEffect } from 'react';
import { shouldRefreshForAuthEvent } from '../lib/auth-refresh';
import { getSero } from './host';

/**
 * Refreshes admin data when the host window regains attention or auth state changes.
 *
 * Used for settings surfaces that depend on live provider/model availability while
 * preserving each panel's existing draft semantics.
 */
export function useBridgeRefresh(onRefresh: () => void) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        onRefresh();
      }
    };

    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const unsubscribe = getSero().auth.onEvent((event) => {
      if (shouldRefreshForAuthEvent(event)) {
        onRefresh();
      }
    });

    return () => {
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [onRefresh]);
}
