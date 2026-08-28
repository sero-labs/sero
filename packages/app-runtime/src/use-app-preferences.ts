/** Profile-wide preferences for a federated app. */

import { use } from 'react';
import { AppContext, type AppProfilePreferencesValue } from './context';

const UNAVAILABLE_PREFERENCES: AppProfilePreferencesValue = {
  values: {},
  set: () => {},
};

export function useAppPreferences(): AppProfilePreferencesValue {
  const context = use(AppContext);
  if (!context) {
    throw new Error('useAppPreferences must be used inside an <AppProvider>');
  }
  return context.profilePreferences ?? UNAVAILABLE_PREFERENCES;
}
