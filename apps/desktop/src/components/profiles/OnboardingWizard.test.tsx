// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingLaunchState } from './onboarding/useOnboardingLaunch';
import { OnboardingWizard } from './OnboardingWizard';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseOnboardingLaunch = vi.fn<() => OnboardingLaunchState>();
const mockUseLaunchingDialogVisibility = vi.fn(() => false);

vi.mock('./onboarding/useOnboardingLaunch', () => ({
  useOnboardingLaunch: () => mockUseOnboardingLaunch(),
}));

vi.mock('./onboarding/useLaunchingDialogVisibility', () => ({
  useLaunchingDialogVisibility: () => mockUseLaunchingDialogVisibility(),
}));

vi.mock('@/stores/user-feedback-store', () => ({
  useUserFeedbackStore: (selector: (state: { pending: Map<string, unknown> }) => unknown) =>
    selector({ pending: new Map() }),
}));

const originalSeroDescriptor = Object.getOwnPropertyDescriptor(window, 'sero');

function createLaunchState(overrides: Partial<OnboardingLaunchState> = {}): OnboardingLaunchState {
  return {
    uiPhase: 'ready',
    onboardingState: {
      needed: true,
      phase: 'ready',
      hasAnyUsableModels: true,
      hasImportedCredentials: false,
      memoryBootstrapComplete: false,
      recommendation: {
        preferredProvider: 'anthropic',
        sourcesByTier: {},
        tiers: {
          HIGH: { provider: 'anthropic', modelId: 'claude-3.7-sonnet', thinkingLevel: 'high' },
          MED: { provider: 'anthropic', modelId: 'claude-3.5-sonnet', thinkingLevel: 'medium' },
          LOW: { provider: 'openai', modelId: 'gpt-4.1-mini', thinkingLevel: 'low' },
        },
      },
      providerHealth: [],
      availableModelGroups: [],
      warnings: [],
      invalidTiers: [],
      containerRuntime: {
        status: 'available',
        message: 'Apple containers are available.',
        recommended: true,
      },
    },
    showLoginDialog: false,
    preferredProviderId: null,
    errorMessage: null,
    launchStatusMessage: null,
    isContinuing: false,
    syncOnboardingState: vi.fn().mockResolvedValue(undefined),
    openProviders: vi.fn(),
    handleLoginDialogOpenChange: vi.fn(),
    handleLoginComplete: vi.fn(),
    handleContinue: vi.fn().mockResolvedValue(undefined),
    handleErrorBack: vi.fn(),
    dismissReadyScreen: vi.fn(),
    ...overrides,
  };
}

describe('OnboardingWizard', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        shell: {
          openExternal: vi.fn(),
        },
        github: {
          status: vi.fn().mockResolvedValue({ authenticated: false }),
          onEvent: vi.fn(() => () => {}),
          login: vi.fn().mockResolvedValue(undefined),
          logout: vi.fn().mockResolvedValue(undefined),
          cancel: vi.fn().mockResolvedValue(undefined),
        },
        clipboard: {
          writeText: vi.fn().mockResolvedValue(true),
        },
      },
    });

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

    if (originalSeroDescriptor) {
      Object.defineProperty(window, 'sero', originalSeroDescriptor);
    } else {
      Reflect.deleteProperty(window, 'sero');
    }
  });

  it('shows the container warning in the ready flow without blocking continue', async () => {
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState({
      uiPhase: 'ready',
      onboardingState: createLaunchState().onboardingState && {
        ...createLaunchState().onboardingState!,
        containerRuntime: {
          status: 'missing_binary',
          message: 'Install Apple containers.',
          recommended: true,
          docsUrl: 'https://github.com/monobyte/sero/blob/main/docs/guides/macos-containers.md',
        },
      },
    }));

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).toContain('Containers recommended for full Sero features');
    expect(document.body.textContent).toContain('Install Apple containers.');
    expect(document.body.textContent).toContain('Continue');
  });

  it('shows the container warning in the auth flow', async () => {
    const authState = createLaunchState({
      uiPhase: 'auth',
      onboardingState: {
        ...createLaunchState().onboardingState!,
        phase: 'auth',
        hasAnyUsableModels: false,
        recommendation: null,
        containerRuntime: {
          status: 'system_unavailable',
          message: 'Container system is not running.',
          recommended: true,
          docsUrl: 'https://github.com/monobyte/sero/blob/main/docs/guides/macos-containers.md',
        },
      },
    });
    mockUseOnboardingLaunch.mockReturnValue(authState);

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).toContain('Container system is not running.');
    expect(document.body.textContent).toContain('Connect a provider');
  });

  it('omits the container warning when containers are available', async () => {
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState());

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).not.toContain('Containers recommended for full Sero features');
  });
});
