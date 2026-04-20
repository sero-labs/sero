// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlobalModelConfigInput, ModelTierSettings } from '@/types/ipc';
import { resetGitHubAuthStore, useGitHubAuthStore } from '@/stores/github-auth';
import { useOnboardingGitHubStep } from './useOnboardingGitHubStep';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const githubBridge = {
  status: vi.fn(),
  onEvent: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  cancel: vi.fn(),
};

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

const tiers: ModelTierSettings = {
  HIGH: { provider: 'anthropic', modelId: 'claude-3.7-sonnet', thinkingLevel: 'high' },
  MED: { provider: 'anthropic', modelId: 'claude-3.5-sonnet', thinkingLevel: 'medium' },
  LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'low' },
};

function installSeroBridge() {
  Object.defineProperty(window, 'sero', {
    configurable: true,
    value: {
      github: githubBridge,
    },
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

function readStep(container: HTMLDivElement): string | null {
  return container.firstElementChild?.getAttribute('data-step') ?? null;
}

function HookProbe({ onContinue }: { onContinue: (config: GlobalModelConfigInput) => void }) {
  const {
    step,
    checkingGitHub,
    githubAuth,
    lastOutcome,
    handleTierContinue,
    handleConnectGitHub,
    handleBack,
    handleContinueFromGitHub,
  } = useOnboardingGitHubStep({
    tiers,
    canContinue: true,
    continueDisabled: false,
    onContinue,
  });

  return (
    <div
      data-step={step}
      data-checking={checkingGitHub ? 'true' : 'false'}
      data-status-ready={githubAuth.statusReady ? 'true' : 'false'}
      data-authenticated={githubAuth.authStatus?.authenticated ? 'true' : 'false'}
      data-last-outcome={lastOutcome?.outcome ?? ''}
    >
      <button onClick={() => void handleTierContinue()}>Continue</button>
      <button onClick={() => void handleConnectGitHub()}>Connect GitHub</button>
      <button onClick={handleBack}>Back</button>
      <button onClick={handleContinueFromGitHub}>Skip GitHub</button>
    </div>
  );
}

describe('useOnboardingGitHubStep', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitHubAuthStore();
    installSeroBridge();
    githubBridge.status.mockResolvedValue({ authenticated: false });
    githubBridge.onEvent.mockReturnValue(vi.fn());

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();

    resetGitHubAuthStore();

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('re-checks GitHub status before continuing and skips the optional step when already connected', async () => {
    const onContinue = vi.fn();
    githubBridge.status
      .mockResolvedValueOnce({ authenticated: false })
      .mockResolvedValueOnce({ authenticated: true, username: 'octocat' });

    await act(async () => {
      root?.render(<HookProbe onContinue={onContinue} />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-status-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(onContinue).toHaveBeenCalledWith({ tiers });
    });

    expect(readStep(container)).toBe('tiers');
    expect(githubBridge.cancel).not.toHaveBeenCalled();
  });

  it('shows the GitHub step for unauthenticated users and lets them go back or continue without cancelling a local device flow', async () => {
    const onContinue = vi.fn();

    await act(async () => {
      root?.render(<HookProbe onContinue={onContinue} />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-status-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(readStep(container)).toBe('github');
    });

    await act(async () => {
      findButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(readStep(container)).toBe('tiers');
    expect(githubBridge.cancel).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();

    await act(async () => {
      findButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(readStep(container)).toBe('github');
    });

    await act(async () => {
      findButton('Skip GitHub').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(githubBridge.cancel).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledWith({ tiers });
  });

  it('launches the shared GitHub auth dialog and returns to a connected onboarding step without auto-continuing', async () => {
    const onContinue = vi.fn();

    await act(async () => {
      root?.render(<HookProbe onContinue={onContinue} />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-status-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(readStep(container)).toBe('github');
    });

    await act(async () => {
      findButton('Connect GitHub').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    expect(githubBridge.login).not.toHaveBeenCalled();

    githubBridge.status.mockResolvedValueOnce({ authenticated: true, username: 'octocat' });

    await act(async () => {
      useGitHubAuthStore.getState().resolveGitHubAuthDialog({
        outcome: 'success',
        status: { authenticated: true, username: 'octocat' },
      });
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-authenticated')).toBe('true');
    });

    expect(readStep(container)).toBe('github');
    expect(container.firstElementChild?.getAttribute('data-last-outcome')).toBe('');
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('keeps users on the GitHub step with a retryable outcome after cancelling the shared dialog', async () => {
    const onContinue = vi.fn();

    await act(async () => {
      root?.render(<HookProbe onContinue={onContinue} />);
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-status-ready')).toBe('true');
    });

    await act(async () => {
      findButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(readStep(container)).toBe('github');
    });

    await act(async () => {
      findButton('Connect GitHub').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(useGitHubAuthStore.getState().open).toBe(true);
    });

    expect(githubBridge.login).not.toHaveBeenCalled();

    await act(async () => {
      useGitHubAuthStore.getState().resolveGitHubAuthDialog({
        outcome: 'cancelled',
        status: { authenticated: false },
      });
    });

    await vi.waitFor(() => {
      expect(container.firstElementChild?.getAttribute('data-last-outcome')).toBe('cancelled');
    });

    expect(readStep(container)).toBe('github');
    expect(container.firstElementChild?.getAttribute('data-authenticated')).toBe('false');
    expect(onContinue).not.toHaveBeenCalled();
  });
});
