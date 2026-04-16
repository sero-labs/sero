import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/app';
import type { GlobalModelConfigInput, ModelTierSettings, OnboardingState } from '@/types/ipc';
import {
  buildAuthRecovery,
  deriveUiPhase,
  getOnboardingLaunchRuntimeDeps,
  getReconnectProviderMessage,
  type OnboardingUiPhase,
  runWelcomeOnboardingFlow,
} from './onboarding-launch-runtime';

interface SyncOnboardingOptions {
  preserveLaunchMessage?: boolean;
}

export interface OnboardingLaunchState {
  uiPhase: OnboardingUiPhase;
  onboardingState: OnboardingState | null;
  showLoginDialog: boolean;
  preferredProviderId: string | null;
  errorMessage: string | null;
  launchStatusMessage: string | null;
  isContinuing: boolean;
  syncOnboardingState: (options?: SyncOnboardingOptions) => Promise<void>;
  openProviders: (providerId?: string | null) => void;
  handleLoginDialogOpenChange: (open: boolean) => void;
  handleLoginComplete: () => void;
  handleContinue: (config: GlobalModelConfigInput) => Promise<void>;
  handleErrorBack: () => void;
  dismissReadyScreen: () => void;
}

export function useOnboardingLaunch(): OnboardingLaunchState {
  const [uiPhase, setUiPhase] = useState<OnboardingUiPhase>('checking');
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [preferredProviderId, setPreferredProviderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launchStatusMessage, setLaunchStatusMessage] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const continueInFlightRef = useRef(false);

  const syncOnboardingState = useCallback(async (options?: SyncOnboardingOptions) => {
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
    if (!open) {
      setPreferredProviderId(null);
    }
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
    setErrorMessage(null);
    setLaunchStatusMessage(null);
    setUiPhase('launching');

    const result = await runWelcomeOnboardingFlow(getOnboardingLaunchRuntimeDeps(), tiers);

    if (result.kind === 'finished') {
      await finishOnboardingLaunch();
      return;
    }

    if (result.kind === 'auth-error') {
      try {
        setOnboardingState(result.onboardingState);
        const recovery = buildAuthRecovery(result.onboardingState, result.message);
        if (recovery && recovery.canAutoRetry) {
          setLaunchStatusMessage(recovery.statusMessage);
          await window.sero.modelConfig.set({ tiers: recovery.retryTiers });
          await launchWelcomeSession(recovery.retryTiers);
          return;
        }

        setLaunchStatusMessage(getReconnectProviderMessage());
        continueInFlightRef.current = false;
        setIsContinuing(false);
        setUiPhase(deriveUiPhase(result.onboardingState));
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
    setErrorMessage(result.message);
    setUiPhase('error');
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

  return {
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
  };
}
