import { useEffect, useState } from 'react';
import type { OnboardingUiPhase } from './onboarding-launch-runtime';

export function useLaunchingDialogVisibility(
  uiPhase: OnboardingUiPhase,
  hasPendingUserInput: boolean,
): boolean {
  const [launchingDialogDismissed, setLaunchingDialogDismissed] = useState(false);

  useEffect(() => {
    if (uiPhase !== 'launching') {
      setLaunchingDialogDismissed(false);
      return;
    }

    if (hasPendingUserInput) {
      setLaunchingDialogDismissed(true);
    }
  }, [hasPendingUserInput, uiPhase]);

  return uiPhase === 'launching' && !hasPendingUserInput && !launchingDialogDismissed;
}
