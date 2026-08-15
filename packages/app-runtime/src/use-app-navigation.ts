/** Browser-style navigation for a federated app's own views. */

import { use } from 'react';
import { AppContext, type AppNavigationValue } from './context';

const UNAVAILABLE_NAVIGATION: AppNavigationValue = {
  navigate: () => {},
};

/**
 * Read the host's current sub-view and publish local sub-view changes.
 * Older hosts return a no-op navigation object, so plugin state can still
 * provide its own persistence without a hard compatibility failure.
 */
export function useAppNavigation(): AppNavigationValue {
  const context = use(AppContext);
  if (!context) {
    throw new Error('useAppNavigation must be used inside an <AppProvider>');
  }
  return context.navigation ?? UNAVAILABLE_NAVIGATION;
}
