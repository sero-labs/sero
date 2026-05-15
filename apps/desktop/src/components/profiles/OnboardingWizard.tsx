/**
 * OnboardingWizard — recommendation-first profile onboarding.
 *
 * Electron preflight decides whether onboarding is ready, auth-blocked, or done.
 * The renderer only manages transient UI states like launching and recovery.
 */

import { Dialog, DialogContent } from '@sero-ai/ui/components/ui/dialog';
import seroLogoDarkUrl from '@assets/logo-dark.svg';
import { AuthLoginDialog } from '@/components/layout/auth/AuthLoginDialog';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import {
  AuthScreen,
  ErrorScreen,
  LaunchingScreen,
  OnboardingSetupScreen,
} from './onboarding/OnboardingViews';
import { ContainerRuntimeNotice } from './onboarding/ContainerRuntimeNotice';
import { useLaunchingDialogVisibility } from './onboarding/useLaunchingDialogVisibility';
import { useOnboardingLaunch } from './onboarding/useOnboardingLaunch';

function OnboardingLogo() {
  return (
    <div className="flex justify-center pb-1">
      <img src={seroLogoDarkUrl} alt="Sero" className="h-9 w-auto" draggable={false} />
    </div>
  );
}

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
  const hasPendingUserInput = useUserFeedbackStore((state) => state.pending.size > 0);
  const isLaunchingDialogVisible = useLaunchingDialogVisibility(uiPhase, hasPendingUserInput);

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
      <Dialog open={isLaunchingDialogVisible} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="space-y-5">
            <OnboardingLogo />
            <LaunchingScreen statusMessage={launchStatusMessage} />
          </div>
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
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto" onInteractOutside={(event) => event.preventDefault()}>
          <div className="space-y-4">
            <OnboardingLogo />
            <ContainerRuntimeNotice runtime={onboardingState.containerRuntime} />
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'auth'} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="space-y-4">
            <OnboardingLogo />
            <ContainerRuntimeNotice runtime={onboardingState.containerRuntime} />
            <AuthScreen
              providerHealth={onboardingState.providerHealth}
              launchNotice={launchStatusMessage}
              onOpenProviders={() => openProviders()}
              onReconnectProvider={openProviders}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'error'} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md"
          showCloseButton={false}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="space-y-5">
            <OnboardingLogo />
            <ErrorScreen
              message={errorMessage}
              onRetry={() => void syncOnboardingState({ preserveLaunchMessage: true })}
              onBack={handleErrorBack}
            />
          </div>
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
