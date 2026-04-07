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
  ChatMessage,
  GlobalModelConfigInput,
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
  OnboardingState,
} from '@/types/ipc';
import {
  AuthScreen,
  ErrorScreen,
  LaunchingScreen,
  OnboardingSetupScreen,
} from './onboarding/OnboardingViews';

type OnboardingUiPhase = 'checking' | 'ready' | 'auth' | 'launching' | 'error' | 'done';

const WELCOME_PROMPT = "Hey! I'm new here — set up my memory so you can get to know me.";
const WELCOME_GREETING_PROMPT = "The user just finished setting up their profile. Say hello, introduce yourself briefly, and let them know you're ready to help.";
const DEFAULT_TIER_ORDER: readonly ModelTier[] = ['HIGH', 'MED', 'LOW'] as const;

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

function extractAssistantErrorMessage(text: string): string | null {
  const match = text.match(/^_Assistant error:\s*(.+?)_$/s);
  return match?.[1]?.trim() ?? null;
}

async function getLatestTurnFailure(sessionId: string, sessionPath: string): Promise<string | null> {
  const messages = await window.sero.agent.open(sessionId, sessionPath, 'global');
  let lastUserIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].type === 'user') {
      lastUserIndex = index;
      break;
    }
  }

  const turnMessages: ChatMessage[] = lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1) : messages;
  if (turnMessages.length === 0) {
    return 'The selected model did not produce a response.';
  }

  for (let index = turnMessages.length - 1; index >= 0; index -= 1) {
    const message = turnMessages[index];
    if (message.type === 'assistant') {
      const assistantError = extractAssistantErrorMessage(message.text);
      if (assistantError) return assistantError;
      continue;
    }
    if (message.type === 'tool' && message.isError) {
      return message.output?.trim() || `${message.toolName} failed during onboarding.`;
    }
  }

  return null;
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

async function applyTierModel(
  sessionId: string,
  tiers: ModelTierSettings,
  tierOrder: readonly ModelTier[] = DEFAULT_TIER_ORDER,
): Promise<boolean> {
  for (const tier of tierOrder) {
    const entry = tiers[tier];
    if (entry) return applyModelEntry(sessionId, entry);
  }
  return false;
}

async function createAndRunSession(options: {
  name?: string;
  tiers: ModelTierSettings;
  thinkingLevel?: string;
  prompt: string;
  setupUi?: (sessionId: string) => void;
  tierOrder?: readonly ModelTier[];
}): Promise<{ sessionId: string; sessionPath: string }> {
  const session = await useSessionStore.getState().createSession('global');
  await window.sero.agent.open(session.id, session.path, 'global');

  if (options.name) {
    await useSessionStore.getState().renameSession(session.id, options.name);
  }

  await applyTierModel(session.id, options.tiers, options.tierOrder);

  if (options.thinkingLevel) {
    try {
      await window.sero.agent.setThinkingLevel(session.id, options.thinkingLevel);
    } catch {
      // Model may not support thinking levels — proceed with default.
    }
  }

  options.setupUi?.(session.id);

  await window.sero.agent.prompt(session.id, options.prompt);
  return { sessionId: session.id, sessionPath: session.path };
}

async function teardownSession(sessionId: string, sessionPath: string): Promise<void> {
  try {
    await window.sero.agent.close(sessionId);
  } catch {
    // Session may already be closed.
  }
  try {
    await useSessionStore.getState().deleteSession(sessionPath);
  } catch {
    // Best-effort cleanup.
  }
}

export function OnboardingWizard() {
  const [uiPhase, setUiPhase] = useState<OnboardingUiPhase>('checking');
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
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

    let tempSessionId: string | null = null;
    let tempSessionPath: string | null = null;
    let memoryBootstrapComplete = false;

    try {
      // Phase 1: Run memory setup in a dedicated low-thinking session.
      const temp = await createAndRunSession({
        tiers,
        thinkingLevel: 'low',
        prompt: WELCOME_PROMPT,
        tierOrder: ['LOW', 'MED', 'HIGH'],
      });
      tempSessionId = temp.sessionId;
      tempSessionPath = temp.sessionPath;

      const tempFailure = await getLatestTurnFailure(tempSessionId, tempSessionPath);
      if (tempFailure) {
        throw new Error(tempFailure);
      }

      const refreshedState = await window.sero.onboarding.getState();
      setOnboardingState(refreshedState);
      if (!refreshedState.memoryBootstrapComplete) {
        throw new Error('Memory onboarding did not finish. Try another model or reconnect a provider.');
      }
      memoryBootstrapComplete = true;

      // Phase 2: Tear down the temp session.
      await teardownSession(tempSessionId, tempSessionPath);
      tempSessionId = null;
      tempSessionPath = null;

      // Phase 3: Create the user's clean welcome session.
      const welcome = await createAndRunSession({
        name: 'Welcome',
        tiers,
        prompt: WELCOME_GREETING_PROMPT,
        setupUi: (sessionId) => {
          useSessionStore.getState().setActiveSession(sessionId);
          useAgentStore.getState().focusSession(sessionId);
          useAppStore.getState().setChatPanelOpen(true);
        },
      });

      const welcomeFailure = await getLatestTurnFailure(welcome.sessionId, welcome.sessionPath);
      if (welcomeFailure) {
        console.warn('[onboarding] Welcome session failed after bootstrap:', welcomeFailure);
      }

      useSessionStore.getState().setActiveSession(welcome.sessionId);
      await finishOnboardingLaunch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Clean up temp session on failure if it's still around.
      if (tempSessionId && tempSessionPath) {
        await teardownSession(tempSessionId, tempSessionPath);
      }

      if (memoryBootstrapComplete) {
        console.warn('[onboarding] Welcome launch failed after memory bootstrap:', message);
        await finishOnboardingLaunch();
        return;
      }

      if (isAuthError(message)) {
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
              const nextConfig: GlobalModelConfigInput = {
                tiers: refreshedState.recommendation.tiers,
              };
              await window.sero.modelConfig.set(nextConfig);
              await launchWelcomeSession(refreshedState.recommendation.tiers);
              return;
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
  }, [finishOnboardingLaunch]);

  const handleContinue = useCallback(async (config: GlobalModelConfigInput) => {
    if (continueInFlightRef.current) return;
    continueInFlightRef.current = true;
    setIsContinuing(true);

    try {
      await window.sero.modelConfig.set(config);
      await launchWelcomeSession(config.tiers);
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
