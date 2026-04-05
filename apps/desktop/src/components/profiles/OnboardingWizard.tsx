/**
 * OnboardingWizard — recommendation-first profile onboarding.
 *
 * Electron preflight decides whether onboarding is ready, auth-blocked, or done.
 * The renderer only manages transient UI states like launching and recovery.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@sero-ai/ui/components/ui/dialog';
import { AuthLoginDialog } from '@/components/layout/AuthLoginDialog';
import { useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/sessions';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import type {
  ModelTierEntry,
  ModelTierSettings,
  OnboardingState,
  ResolvedProviderDefaultsState,
} from '@/types/ipc';
import {
  AuthScreen,
  ErrorScreen,
  LaunchingScreen,
  OnboardingSetupScreen,
} from './onboarding/OnboardingViews';

type OnboardingUiPhase = 'checking' | 'ready' | 'auth' | 'launching' | 'error' | 'done';

const WELCOME_PROMPT = "Hey! I'm new here — set up my memory so you can get to know me.";
const EMPTY_PROVIDER_DEFAULTS: ResolvedProviderDefaultsState = {
  builtInDefaults: {},
  globalDefaults: {},
  effectiveDefaults: {},
};

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

function getDisplayProviderName(
  state: Pick<OnboardingState, 'providerHealth'> | null,
  providerId: string | null,
): string | null {
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
  const [providerDefaults, setProviderDefaults] = useState<ResolvedProviderDefaultsState>(EMPTY_PROVIDER_DEFAULTS);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [preferredProviderId, setPreferredProviderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launchStatusMessage, setLaunchStatusMessage] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const hideLaunchingDialogRef = useRef(false);
  const continueInFlightRef = useRef(false);
  const hasPendingUserInput = useUserFeedbackStore((state) => state.pending.size > 0);

  if (uiPhase === 'launching' && hasPendingUserInput) {
    hideLaunchingDialogRef.current = true;
  }

  const syncOnboardingState = useCallback(async (options?: { preserveLaunchMessage?: boolean }) => {
    if (!options?.preserveLaunchMessage) {
      setLaunchStatusMessage(null);
    }
    continueInFlightRef.current = false;
    setIsContinuing(false);
    setErrorMessage(null);
    setUiPhase('checking');

    try {
      const [nextState, nextProviderDefaults] = await Promise.all([
        window.sero.onboarding.getState(),
        window.sero.providerDefaults.get().catch(() => EMPTY_PROVIDER_DEFAULTS),
      ]);
      setOnboardingState(nextState);
      setProviderDefaults(nextProviderDefaults);
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

  const openProviders = useCallback((providerId: string | null = null) => {
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

  const finishOnboardingLaunch = useCallback(async () => {
    useAppStore.getState().setActiveApp('dashboard');
    await window.sero.profiles.markOnboardingDone();
    continueInFlightRef.current = false;
    setIsContinuing(false);
    setUiPhase('done');
  }, []);

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
      await finishOnboardingLaunch();
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

            const failedName = getDisplayProviderName(refreshedState, failedProvider);
            const nextName = getDisplayProviderName(refreshedState, nextProvider);
            const canAutoRetry = !failedProvider || !nextProvider || failedProvider !== nextProvider;

            setLaunchStatusMessage(
              failedName && nextName && failedName !== nextName
                ? `${failedName} stopped working. Switching to ${nextName}.`
                : 'Refreshing your provider before launch.',
            );

            if (canAutoRetry) {
              await window.sero.onboarding.saveTierSelections(refreshedState.recommendation.tiers);
              const applied = await applyTierModel(sessionId, refreshedState.recommendation.tiers);
              if (applied) {
                await window.sero.agent.prompt(sessionId, WELCOME_PROMPT);
                await finishOnboardingLaunch();
                return;
              }
            }
          }

          setLaunchStatusMessage('Reconnect a provider before onboarding can continue.');
          continueInFlightRef.current = false;
          setIsContinuing(false);
          setUiPhase(deriveUiPhase(refreshedState));
          return;
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          continueInFlightRef.current = false;
          setIsContinuing(false);
          setErrorMessage(retryMessage);
          setUiPhase('error');
          return;
        }
      }

      continueInFlightRef.current = false;
      setIsContinuing(false);
      setErrorMessage(message);
      setUiPhase('error');
    }
  }, [finishOnboardingLaunch, onboardingState]);

  const handleContinue = useCallback(async (tiers: ModelTierSettings) => {
    if (continueInFlightRef.current) return;
    continueInFlightRef.current = true;
    setIsContinuing(true);

    try {
      await window.sero.onboarding.saveTierSelections(tiers);
      await launchWelcomeSession(tiers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      continueInFlightRef.current = false;
      setIsContinuing(false);
      setErrorMessage(message);
      setUiPhase('error');
    }
  }, [launchWelcomeSession]);

  const handleErrorBack = useCallback(() => {
    if (!onboardingState) {
      setUiPhase('checking');
      void syncOnboardingState();
      return;
    }
    setUiPhase(deriveUiPhase(onboardingState));
  }, [onboardingState, syncOnboardingState]);

  const dismissReadyScreen = useCallback(() => {
    setUiPhase('done');
  }, []);

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
          if (!open) dismissReadyScreen();
        }}
      >
        <DialogContent className="max-w-md" onInteractOutside={(event) => event.preventDefault()}>
          {readyRecommendation ? (
            <OnboardingSetupScreen
              key={`${readyRecommendation.preferredProvider ?? 'provider'}:${JSON.stringify(readyRecommendation.tiers)}`}
              recommendation={readyRecommendation}
              availableModelGroups={onboardingState.availableModelGroups}
              providerHealth={onboardingState.providerHealth}
              providerDefaults={providerDefaults}
              warnings={onboardingState.warnings.filter((warning) => warning.code !== 'no_usable_models')}
              launchNotice={launchStatusMessage}
              continueDisabled={isContinuing}
              onContinue={(tiers) => void handleContinue(tiers)}
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
