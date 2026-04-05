/**
 * OnboardingWizard — recommendation-first profile onboarding.
 *
 * Electron preflight decides whether onboarding is ready, auth-blocked, or done.
 * The renderer only manages transient UI states like customize and launching.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@sero-ai/ui/components/ui/dialog';
import { AuthLoginDialog } from '@/components/layout/AuthLoginDialog';
import { useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import type { ModelTierEntry, ModelTierSettings, OnboardingState } from '@/types/ipc';
import { TierPicker } from './TierPicker';
import {
  AuthScreen,
  ErrorScreen,
  LaunchingScreen,
  ReadyScreen,
} from './onboarding/OnboardingViews';

type OnboardingUiPhase =
  | 'checking'
  | 'ready'
  | 'customize'
  | 'auth'
  | 'launching'
  | 'error'
  | 'done';

const WELCOME_PROMPT = "Hey! I'm new here — set up my memory so you can get to know me.";

function deriveUiPhase(state: OnboardingState): OnboardingUiPhase {
  if (!state.needed || state.phase === 'done') return 'done';
  if (state.phase === 'ready') return 'ready';
  if (state.phase === 'auth') return 'auth';
  if (state.phase === 'error') return 'error';
  return 'done';
}

function isAuthError(message: string): boolean {
  return /authentication failed|unauthorized|401|no api key|credentials/i.test(message);
}

function extractFailedProvider(message: string): string | null {
  const match = message.match(/Authentication failed for "([^"]+)"/i);
  return match ? match[1] : null;
}

function getDisplayProviderName(state: OnboardingState | null, providerId: string | null): string | null {
  if (!state || !providerId) return providerId;
  return state.providerHealth.find((provider) => provider.providerId === providerId)?.displayName ?? providerId;
}

async function applyModelEntry(sessionId: string, entry: ModelTierEntry | null): Promise<boolean> {
  if (!entry) return false;

  try {
    await window.sero.agent.setModel(sessionId, entry.provider, entry.modelId);
    return true;
  } catch {
    // Fall through to lookup-by-model-id fallback.
  }

  try {
    const state = await window.sero.agent.getModelState(sessionId);
    if (!state) return false;

    for (const group of state.availableModels) {
      const match = group.models.find((model) => model.modelId === entry.modelId);
      if (!match) continue;
      await window.sero.agent.setModel(sessionId, match.provider, match.modelId);
      return true;
    }
  } catch {
    // Ignore — onboarding will recover via preflight on the next refresh.
  }

  return false;
}

async function applyTierModel(sessionId: string, tiers: ModelTierSettings): Promise<boolean> {
  return applyModelEntry(sessionId, tiers.HIGH ?? tiers.MED ?? tiers.LOW ?? null);
}

export function OnboardingWizard() {
  const [uiPhase, setUiPhase] = useState<OnboardingUiPhase>('checking');
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [preferredProviderId, setPreferredProviderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launchStatusMessage, setLaunchStatusMessage] = useState<string | null>(null);
  const hideLaunchingDialogRef = useRef(false);
  const hasPendingUserInput = useUserFeedbackStore((state) => state.pending.size > 0);

  if (uiPhase === 'launching' && hasPendingUserInput) {
    hideLaunchingDialogRef.current = true;
  }

  const syncOnboardingState = useCallback(async (options?: { preserveLaunchMessage?: boolean }) => {
    if (!options?.preserveLaunchMessage) {
      setLaunchStatusMessage(null);
    }
    setErrorMessage(null);
    setUiPhase('checking');

    try {
      const nextState = await window.sero.onboarding.getState();
      setOnboardingState(nextState);
      setUiPhase(deriveUiPhase(nextState));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setUiPhase('error');
    }
  }, []);

  useEffect(() => {
    void syncOnboardingState();
  }, [syncOnboardingState]);

  const openAuthDialog = useCallback((providerId: string | null = null) => {
    setPreferredProviderId(providerId);
    setShowLoginDialog(true);
  }, []);

  const handleLoginDialogOpenChange = useCallback((open: boolean) => {
    setShowLoginDialog(open);
    if (!open) setPreferredProviderId(null);
  }, []);

  const handleLoginComplete = useCallback(() => {
    setShowLoginDialog(false);
    setPreferredProviderId(null);
    void syncOnboardingState();
  }, [syncOnboardingState]);

  const handleSaveCustomizations = useCallback(async (tiers: ModelTierSettings) => {
    try {
      await window.sero.onboarding.saveTierSelections(tiers);
      await syncOnboardingState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setUiPhase('error');
    }
  }, [syncOnboardingState]);

  const launchWelcomeSession = useCallback(async (tiers: ModelTierSettings) => {
    hideLaunchingDialogRef.current = false;
    setErrorMessage(null);
    setLaunchStatusMessage(null);
    setUiPhase('launching');

    let sessionId: string | null = null;

    try {
      const session = await useSessionStore.getState().createSession('global');
      sessionId = session.id;
      useSessionStore.getState().setActiveSession(session.id);
      await window.sero.agent.open(session.id, session.path, 'global');
      await useSessionStore.getState().renameSession(session.id, 'Welcome');
      useAgentStore.getState().focusSession(session.id);
      useAppStore.getState().setChatPanelOpen(true);

      await applyTierModel(session.id, tiers);
      await window.sero.agent.prompt(session.id, WELCOME_PROMPT);
      await window.sero.profiles.markOnboardingDone();
      setUiPhase('done');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthError(message) && sessionId) {
        try {
          const refreshedState = await window.sero.onboarding.getState();
          setOnboardingState(refreshedState);

          if (refreshedState.phase === 'ready' && refreshedState.recommendation) {
            const failedProvider = extractFailedProvider(message);
            const nextProvider = refreshedState.recommendation.preferredProvider
              ?? refreshedState.recommendation.tiers.HIGH?.provider
              ?? refreshedState.recommendation.tiers.MED?.provider
              ?? refreshedState.recommendation.tiers.LOW?.provider
              ?? null;

            const failedName = getDisplayProviderName(onboardingState, failedProvider);
            const nextName = getDisplayProviderName(refreshedState, nextProvider);
            const canAutoRetry = !failedProvider || !nextProvider || failedProvider !== nextProvider;

            setLaunchStatusMessage(
              failedName && nextName && failedName !== nextName
                ? `${failedName} stopped working. Switching to ${nextName}.`
                : 'Refreshing your recommended provider before launch.',
            );

            if (canAutoRetry) {
              await window.sero.onboarding.saveTierSelections(refreshedState.recommendation.tiers);
              const applied = await applyTierModel(sessionId, refreshedState.recommendation.tiers);
              if (applied) {
                await window.sero.agent.prompt(sessionId, WELCOME_PROMPT);
                await window.sero.profiles.markOnboardingDone();
                setUiPhase('done');
                return;
              }
            }
          }

          setLaunchStatusMessage(
            'Your previous provider needs to be reconnected before onboarding can continue.',
          );
          setUiPhase(deriveUiPhase(refreshedState));
          return;
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          setErrorMessage(retryMessage);
          setUiPhase('error');
          return;
        }
      }

      setErrorMessage(message);
      setUiPhase('error');
    }
  }, [onboardingState]);

  const handleContinue = useCallback(async () => {
    if (!onboardingState?.recommendation) return;

    try {
      await window.sero.onboarding.saveTierSelections(onboardingState.recommendation.tiers);
      await launchWelcomeSession(onboardingState.recommendation.tiers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setUiPhase('error');
    }
  }, [launchWelcomeSession, onboardingState]);

  const handleErrorBack = useCallback(() => {
    if (!onboardingState) {
      setUiPhase('checking');
      void syncOnboardingState();
      return;
    }
    setUiPhase(deriveUiPhase(onboardingState));
  }, [onboardingState, syncOnboardingState]);

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
      <Dialog
        open={uiPhase === 'launching' && !hideLaunchingDialogRef.current}
        onOpenChange={() => {}}
      >
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
          <LaunchingScreen statusMessage={launchStatusMessage} />
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'ready'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
          {readyRecommendation ? (
            <ReadyScreen
              recommendation={readyRecommendation}
              availableModelGroups={onboardingState.availableModelGroups}
              providerHealth={onboardingState.providerHealth}
              warnings={onboardingState.warnings.filter((warning) => warning.code !== 'no_usable_models')}
              launchNotice={launchStatusMessage}
              onContinue={() => void handleContinue()}
              onCustomize={() => setUiPhase('customize')}
              onAddProvider={() => openAuthDialog()}
              onReconnectProvider={openAuthDialog}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'customize'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
          <TierPicker
            groups={onboardingState.availableModelGroups}
            providerHealth={onboardingState.providerHealth}
            initialTiers={readyRecommendation?.tiers ?? {}}
            onSave={(tiers) => void handleSaveCustomizations(tiers)}
            onBack={() => setUiPhase('ready')}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'auth'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
          <AuthScreen
            providerHealth={onboardingState.providerHealth}
            launchNotice={launchStatusMessage}
            onAddProvider={() => openAuthDialog()}
            onReconnectProvider={openAuthDialog}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={uiPhase === 'error'} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
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
