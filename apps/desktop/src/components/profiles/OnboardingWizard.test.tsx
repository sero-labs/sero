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
    mockUseLaunchingDialogVisibility.mockReturnValue(false);
    Object.defineProperty(window, 'sero', {
      configurable: true,
      value: {
        shell: {
          openExternal: vi.fn(),
        },
        platform: 'darwin',
        arch: 'arm64',
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
        workspace: {
          getToolchainStatus: vi.fn().mockResolvedValue({
            state: 'ready',
            tools: [
              { tool: 'node', state: 'ready', source: 'system' },
              { tool: 'npm', state: 'ready', source: 'system' },
            ],
          }),
          ensureCoreTools: vi.fn().mockResolvedValue({ state: 'ready', tools: [] }),
          onToolchainProgress: vi.fn(() => () => {}),
          getBrowserPackStatus: vi.fn().mockResolvedValue({ state: 'installable', manifestVersion: 'test' }),
          ensureBrowserPack: vi.fn().mockResolvedValue({ state: 'installable', manifestVersion: 'test' }),
          onBrowserPackProgress: vi.fn(() => () => {}),
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

  it('shows the container warning only on the dependency step without blocking continue', async () => {
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState({
      uiPhase: 'ready',
      onboardingState: createLaunchState().onboardingState && {
        ...createLaunchState().onboardingState!,
        containerRuntime: {
          status: 'missing_binary',
          message: 'Install Apple containers.',
          recommended: true,
          docsUrl: 'https://docs.sero-ai.dev/guide/installation-requirements.html#runtime-requirements-by-platform',
        },
      },
    }));

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).not.toContain('Containers are not set up');

    const continueButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue'),
    );
    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Containers are not set up');
    expect(document.body.textContent).toContain('Install Apple containers.');
    expect(document.body.textContent).toContain('Continue');
  });

  it('does not show the container warning in the auth flow', async () => {
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
          docsUrl: 'https://docs.sero-ai.dev/guide/installation-requirements.html#runtime-requirements-by-platform',
        },
      },
    });
    mockUseOnboardingLaunch.mockReturnValue(authState);

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).not.toContain('Container system is not running.');
    expect(document.body.textContent).not.toContain('Containers are not set up');
    expect(document.body.textContent).toContain('Connect a provider');
  });

  it('keeps the ready dialog scrollable when setup content is tall', async () => {
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState());

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.className).toContain('max-h-[calc(100vh-2rem)]');
    expect(dialog?.className).toContain('overflow-y-auto');
  });

  it.each([
    {
      phase: 'launching' as const,
      launchStatusMessage: 'Starting memory setup...',
      errorMessage: null,
      launchingDialogVisible: true,
    },
    {
      phase: 'error' as const,
      launchStatusMessage: null,
      errorMessage: 'Try again.',
      launchingDialogVisible: false,
    },
  ])('centers the onboarding $phase header', async ({
    phase,
    launchStatusMessage,
    errorMessage,
    launchingDialogVisible,
  }) => {
    mockUseLaunchingDialogVisibility.mockReturnValue(launchingDialogVisible);
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState({
      uiPhase: phase,
      launchStatusMessage,
      errorMessage,
    }));

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    const header = document.querySelector(`[data-onboarding-step="${phase}"]`);
    expect(header).not.toBeNull();
    expect(header?.className).toContain('items-center');
    expect(header?.className).toContain('text-center');
  });

  it('moves optional dependency installs to their own onboarding step', async () => {
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState());

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    expect(document.body.textContent).toContain('Choose your defaults');
    expect(document.body.textContent).not.toContain('Browser automation dependencies');

    const continueButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue'),
    );
    expect(continueButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Install host dependencies');
    expect(document.body.textContent).toContain('Sero checks core development tools during setup');
    expect(document.body.textContent).toContain('Core development tools');
    expect(document.body.textContent).toContain('Browser automation');
    expect(document.body.textContent).toContain('Large download for browser screenshots');
    expect(document.body.textContent).toContain('Install browser support');
    expect(document.body.textContent).not.toContain('Skip for now');
  });

  it('starts core tool installation from the onboarding dependency step when host tools are missing', async () => {
    const ensureCoreTools = vi.fn().mockResolvedValue({ state: 'ready', tools: [] });
    window.sero.workspace.getToolchainStatus = vi.fn().mockResolvedValue({
      state: 'missing',
      tools: [{ tool: 'node', state: 'missing' }],
      error: { code: 'TOOL_REQUIRED', message: 'node is missing', retryable: true, installable: true },
    });
    window.sero.workspace.ensureCoreTools = ensureCoreTools;
    mockUseOnboardingLaunch.mockReturnValue(createLaunchState());

    await act(async () => {
      root?.render(<OnboardingWizard />);
    });

    const continueButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue'),
    );
    await act(async () => {
      continueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(ensureCoreTools).toHaveBeenCalledWith('onboarding');
  });

});
