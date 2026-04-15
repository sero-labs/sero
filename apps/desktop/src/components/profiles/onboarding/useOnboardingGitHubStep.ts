import { useCallback, useState } from 'react';
import type { GlobalModelConfigInput, ModelTierSettings } from '@/types/ipc';
import { useGitHubAuthFlow } from '@/hooks/useGitHubAuthFlow';

interface UseOnboardingGitHubStepOptions {
  tiers: ModelTierSettings;
  canContinue: boolean;
  continueDisabled?: boolean;
  onContinue: (config: GlobalModelConfigInput) => void;
}

export function useOnboardingGitHubStep({
  tiers,
  canContinue,
  continueDisabled = false,
  onContinue,
}: UseOnboardingGitHubStepOptions) {
  const githubAuth = useGitHubAuthFlow();
  const [step, setStep] = useState<'tiers' | 'github'>('tiers');
  const [checkingGitHub, setCheckingGitHub] = useState(false);

  const handleTierContinue = useCallback(async () => {
    if (!canContinue || continueDisabled || checkingGitHub) return;
    setCheckingGitHub(true);
    try {
      const status = await githubAuth.refreshStatus();
      if (status.authenticated) {
        onContinue({ tiers });
        return;
      }
      setStep('github');
    } catch {
      setStep('github');
    } finally {
      setCheckingGitHub(false);
    }
  }, [canContinue, continueDisabled, checkingGitHub, githubAuth, onContinue, tiers]);

  const handleBack = useCallback(() => {
    githubAuth.cancel();
    setStep('tiers');
  }, [githubAuth]);

  const handleContinueFromGitHub = useCallback(() => {
    githubAuth.cancel();
    onContinue({ tiers });
  }, [githubAuth, onContinue, tiers]);

  return {
    step,
    checkingGitHub,
    githubAuth,
    handleTierContinue,
    handleBack,
    handleContinueFromGitHub,
  };
}
