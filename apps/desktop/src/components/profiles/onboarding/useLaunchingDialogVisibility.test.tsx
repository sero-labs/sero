// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OnboardingUiPhase } from './onboarding-launch-runtime';
import { useLaunchingDialogVisibility } from './useLaunchingDialogVisibility';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HookProbeProps {
  uiPhase: OnboardingUiPhase;
  hasPendingUserInput: boolean;
}

function HookProbe({ uiPhase, hasPendingUserInput }: HookProbeProps) {
  const isVisible = useLaunchingDialogVisibility(uiPhase, hasPendingUserInput);
  return <div data-visible={isVisible ? 'true' : 'false'} />;
}

function readVisibility(container: HTMLDivElement): string | null {
  return container.firstElementChild?.getAttribute('data-visible') ?? null;
}

describe('useLaunchingDialogVisibility', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('shows the launch dialog while onboarding is launching without pending input', async () => {
    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={false} />);
    });

    expect(readVisibility(container)).toBe('true');
  });

  it('hides the launch dialog once pending user input appears and keeps it hidden for that launch', async () => {
    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={false} />);
    });
    expect(readVisibility(container)).toBe('true');

    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={true} />);
    });
    expect(readVisibility(container)).toBe('false');

    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={false} />);
    });
    expect(readVisibility(container)).toBe('false');
  });

  it('resets the dismissal once onboarding leaves the launching phase', async () => {
    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={true} />);
    });
    expect(readVisibility(container)).toBe('false');

    await act(async () => {
      root?.render(<HookProbe uiPhase="ready" hasPendingUserInput={false} />);
    });
    expect(readVisibility(container)).toBe('false');

    await act(async () => {
      root?.render(<HookProbe uiPhase="launching" hasPendingUserInput={false} />);
    });
    expect(readVisibility(container)).toBe('true');
  });
});
