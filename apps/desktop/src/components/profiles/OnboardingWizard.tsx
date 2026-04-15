/**
 * OnboardingWizard — recommendation-first profile onboarding.
 *
 * Electron preflight decides whether onboarding is ready, auth-blocked, or done.
 * The renderer only manages transient UI states like launching and recovery.
 */

import { useRef } from 'react';
import { Dialog, DialogContent } from '@sero-ai/ui/components/ui/dialog';
import { AuthLoginDialog } from '@/components/layout/AuthLoginDialog';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import {
  AuthScreen,
  ErrorScreen,
  LaunchingScreen,
  OnboardingSetupScreen,
} from './onboarding/OnboardingViews';
import { useOnboardingLaunch } from './onboarding/useOnboardingLaunch';

export function OnboardingWizard() {
  const {
    uiPhase,
    onboardingState,
    showLoginDialog,
    preferredProviderId,
    errorMessage,
    launchStatusMessage,
    isContinuing,
    syncOnboardingState,
    openProviders,
    handleLoginDialogOpenChange,
    handleLoginComplete,
    handleContinue,
    handleErrorBack,
    dismissReadyScreen,
  } = useOnboardingLaunch();
  const hideLaunchingDialogRef = useRef(false);
  const hasPendingUserInput = useUserFeedbackStore((state) => state.pending.size > 0);

  if (uiPhase === 'launching' && hasPendingUserInput) {
    hideLaunchingDialogRef.current = true;
  }

  if (uiPhase === 'checking' || uiPhase === 'done' || !onboardingState) {
    return (
      <AuthLoginDialog
        open={showLoginDialog}
        onOpenChange={handleLoginDialogOpenChange}
        onComplete={handleLoginComplete}
        preferredProviderId={preferredProviderId}
      />
    );
  }

  const readyRecommendation = onboardingState.recommendation;

  return (
    <>
      <Dialog open={uiPhase === 'launching' && !hideLaunchingDialogRef.current} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <LaunchingScreen statusMessage={launchStatusMessage} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={uiPhase === 'ready'}
        onOpenChange={(open) => {
          if (!open) {
            dismissReadyScreen();
          }
        }}
      >
        <DialogContent className="max-w-lg" onInteractOutside={(event) => event.preventDefault()}>
          {readyRecommendation ? (
            <OnboardingSetupScreen
              key={`${readyRecommendation.preferredProvider ?? 'provider'}:${JSON.stringify(readyRecommendation.tiers)}`}
              recommendation={readyRecommendation}
              availableModelGroups={onboardingState.availableModelGroups}
              providerHealth={onboardingState.providerHealth}
              warnings={onboardingState.warnings.filter((warning) => warning.code !== 'no_usable_models')}
              launchNotice={launchStatusMessage}
              continueDisabled={isContinuing}
              onContinue={(config) => void handleContinue(config)}
              onOpenProviders={() => openProviders()}
              onReconnectProvider={openProviders}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'auth'} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <AuthScreen
            providerHealth={onboardingState.providerHealth}
            launchNotice={launchStatusMessage}
            onOpenProviders={() => openProviders()}
            onReconnectProvider={openProviders}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'error'} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <ErrorScreen
            message={errorMessage}
            onRetry={() => void syncOnboardingState({ preserveLaunchMessage: true })}
            onBack={handleErrorBack}
          />
        </DialogContent>
      </Dialog>

      <AuthLoginDialog
        open={showLoginDialog}
        onOpenChange={handleLoginDialogOpenChange}
        onComplete={handleLoginComplete}
        preferredProviderId={preferredProviderId}
      />
    </>
  );
}
