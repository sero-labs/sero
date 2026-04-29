import { useCallback, useEffect, useState } from 'react';
import type { GlobalModelConfigInput, ModelTierSettings } from '@/types/ipc';
import { useGitHubAuthFlow } from '@/hooks/useGitHubAuthFlow';
import { useGitHubAuthStore } from '@/stores/github-auth';
import type { GitHubAuthDialogResult } from '@/stores/github-auth';

interface UseOnboardingGitHubStepOptions {
  tiers: ModelTierSettings;
  canContinue: boolean;
  continueDisabled?: boolean;
  onContinue: (config: GlobalModelConfigInput) => void;
}

type OnboardingGitHubOutcome = Extract<GitHubAuthDialogResult, { outcome: 'cancelled' | 'error' }>;

export function useOnboardingGitHubStep({
  tiers,
  canContinue,
  continueDisabled = false,
  onContinue,
}: UseOnboardingGitHubStepOptions) {
  const githubAuth = useGitHubAuthFlow();
  const openGitHubAuthDialog = useGitHubAuthStore((state) => state.openGitHubAuthDialog);
  const [step, setStep] = useState<'tiers' | 'github'>('tiers');
  const [checkingGitHub, setCheckingGitHub] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<OnboardingGitHubOutcome | null>(null);

  useEffect(() => {
    if (githubAuth.authStatus?.authenticated) {
      setLastOutcome(null);
    }
  }, [githubAuth.authStatus?.authenticated]);

  const handleTierContinue = useCallback(async () => {
    if (!canContinue || continueDisabled || checkingGitHub) return;
    setCheckingGitHub(true);
    try {
      const status = await githubAuth.refreshStatus();
      if (status.authenticated) {
        onContinue({ tiers });
        return;
      }
      setLastOutcome(null);
      setStep('github');
    } catch {
      setLastOutcome(null);
      setStep('github');
    } finally {
      setCheckingGitHub(false);
    }
  }, [canContinue, continueDisabled, checkingGitHub, githubAuth, onContinue, tiers]);

  const handleConnectGitHub = useCallback(async () => {
    setLastOutcome(null);
    const result = await openGitHubAuthDialog({ source: 'onboarding' });
    await githubAuth.refreshStatus();
    if (result.outcome === 'success') return;
    setLastOutcome(result);
  }, [githubAuth, openGitHubAuthDialog]);

  const handleBack = useCallback(() => {
    setLastOutcome(null);
    setStep('tiers');
  }, []);

  const handleContinueFromGitHub = useCallback(() => {
    onContinue({ tiers });
  }, [onContinue, tiers]);

  return {
    step,
    checkingGitHub,
    githubAuth,
    lastOutcome,
    handleTierContinue,
    handleConnectGitHub,
    handleBack,
    handleContinueFromGitHub,
  };
}
