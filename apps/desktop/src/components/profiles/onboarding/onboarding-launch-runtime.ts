import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useSessionStore } from '@/stores/sessions';
import type {
  ChatHistoryPage,
  ChatMessage,
  ModelTier,
  ModelTierEntry,
  ModelTierSettings,
  OnboardingState,
  SessionModelState,
} from '@/types/ipc';

export type OnboardingUiPhase = 'checking' | 'ready' | 'auth' | 'launching' | 'error' | 'done';

const DEFAULT_TIER_ORDER: readonly ModelTier[] = ['HIGH', 'MED', 'LOW'] as const;
const LOW_FIRST_TIER_ORDER: readonly ModelTier[] = ['LOW', 'MED', 'HIGH'] as const;
const WELCOME_PROMPT = "Hey! I'm new here — set up my memory so you can get to know me.";
const WELCOME_GREETING_PROMPT = "The user just finished setting up their profile. Say hello, introduce yourself briefly, and let them know you're ready to help.";
const MEMORY_BOOTSTRAP_ERROR = 'Memory onboarding did not finish. Try another model or reconnect a provider.';
const RECONNECT_PROVIDER_MESSAGE = 'Reconnect a provider before onboarding can continue.';

interface OnboardingSessionInfo {
  id: string;
  path: string;
}

interface OnboardingSessionStore {
  createSession: (workspaceId?: string) => Promise<OnboardingSessionInfo>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionPath: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
}

interface OnboardingAgentStore {
  focusSession: (sessionId: string) => void;
}

interface OnboardingAppStore {
  setChatPanelOpen: (open: boolean) => void;
}

interface OnboardingAgentBridge {
  open: (sessionId: string, sessionPath: string, workspaceId: string) => Promise<ChatHistoryPage>;
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<SessionModelState>;
  getModelState: (sessionId: string) => Promise<SessionModelState | null>;
  setThinkingLevel: (sessionId: string, level: string) => Promise<SessionModelState>;
  prompt: (sessionId: string, text: string) => Promise<void>;
  close: (sessionId: string) => Promise<void>;
}

interface OnboardingBridge {
  getState: () => Promise<OnboardingState>;
}

export interface OnboardingLaunchRuntimeDeps {
  agent: OnboardingAgentBridge;
  onboarding: OnboardingBridge;
  sessionStore: OnboardingSessionStore;
  agentStore: OnboardingAgentStore;
  appStore: OnboardingAppStore;
  logger?: Pick<typeof console, 'warn'>;
}

interface CreateAndRunSessionOptions {
  name?: string;
  tiers: ModelTierSettings;
  thinkingLevel?: string;
  prompt: string;
  setupUi?: (sessionId: string) => void;
  tierOrder?: readonly ModelTier[];
}

export type OnboardingLaunchResult =
  | { kind: 'finished' }
  | { kind: 'auth-error'; message: string; onboardingState: OnboardingState }
  | { kind: 'error'; message: string };

export interface OnboardingAuthRecovery {
  canAutoRetry: boolean;
  retryTiers: ModelTierSettings;
  statusMessage: string;
}

export function deriveUiPhase(state: OnboardingState): OnboardingUiPhase {
  if (!state.needed || state.phase === 'done') return 'done';
  if (state.phase === 'ready') return 'ready';
  if (state.phase === 'auth') return 'auth';
  if (state.phase === 'error') return 'error';
  return 'done';
}

export function getReconnectProviderMessage(): string {
  return RECONNECT_PROVIDER_MESSAGE;
}

export function getOnboardingLaunchRuntimeDeps(): OnboardingLaunchRuntimeDeps {
  const sessionState = useSessionStore.getState();
  const agentState = useAgentStore.getState();
  const appState = useAppStore.getState();

  return {
    agent: window.sero.agent,
    onboarding: window.sero.onboarding,
    sessionStore: {
      createSession: sessionState.createSession,
      renameSession: sessionState.renameSession,
      deleteSession: sessionState.deleteSession,
      setActiveSession: sessionState.setActiveSession,
    },
    agentStore: {
      focusSession: agentState.focusSession,
    },
    appStore: {
      setChatPanelOpen: appState.setChatPanelOpen,
    },
    logger: console,
  };
}

export function buildAuthRecovery(
  onboardingState: OnboardingState,
  message: string,
): OnboardingAuthRecovery | null {
  if (onboardingState.phase !== 'ready' || !onboardingState.recommendation) {
    return null;
  }

  const failedProvider = extractFailedProvider(message);
  const nextProvider = onboardingState.recommendation.preferredProvider
    ?? onboardingState.recommendation.tiers.HIGH?.provider
    ?? onboardingState.recommendation.tiers.MED?.provider
    ?? onboardingState.recommendation.tiers.LOW?.provider
    ?? null;

  const failedName = getDisplayProviderName(onboardingState, failedProvider);
  const nextName = getDisplayProviderName(onboardingState, nextProvider);

  return {
    canAutoRetry: !failedProvider || !nextProvider || failedProvider !== nextProvider,
    retryTiers: onboardingState.recommendation.tiers,
    statusMessage:
      failedName && nextName && failedName !== nextName
        ? `${failedName} stopped working. Switching to ${nextName}.`
        : 'Refreshing your provider before launch.',
  };
}

export async function runWelcomeOnboardingFlow(
  deps: OnboardingLaunchRuntimeDeps,
  tiers: ModelTierSettings,
): Promise<OnboardingLaunchResult> {
  let tempSessionId: string | null = null;
  let tempSessionPath: string | null = null;
  let memoryBootstrapComplete = false;

  try {
    const temp = await createAndRunSession(deps, {
      tiers,
      thinkingLevel: 'low',
      prompt: WELCOME_PROMPT,
      tierOrder: LOW_FIRST_TIER_ORDER,
    });
    tempSessionId = temp.sessionId;
    tempSessionPath = temp.sessionPath;

    const tempFailure = await getLatestTurnFailure(deps, tempSessionId, tempSessionPath);
    if (tempFailure) {
      throw new Error(tempFailure);
    }

    const refreshedState = await deps.onboarding.getState();
    if (!refreshedState.memoryBootstrapComplete) {
      throw new Error(MEMORY_BOOTSTRAP_ERROR);
    }
    memoryBootstrapComplete = true;

    await teardownSession(deps, tempSessionId, tempSessionPath);
    tempSessionId = null;
    tempSessionPath = null;

    const welcome = await createAndRunSession(deps, {
      name: 'Welcome',
      tiers,
      prompt: WELCOME_GREETING_PROMPT,
      setupUi: (sessionId) => {
        deps.sessionStore.setActiveSession(sessionId);
        deps.agentStore.focusSession(sessionId);
        deps.appStore.setChatPanelOpen(true);
      },
    });

    const welcomeFailure = await getLatestTurnFailure(deps, welcome.sessionId, welcome.sessionPath);
    if (welcomeFailure) {
      deps.logger?.warn('[onboarding] Welcome session failed after bootstrap:', welcomeFailure);
    }

    deps.sessionStore.setActiveSession(welcome.sessionId);
    return { kind: 'finished' };
  } catch (error) {
    const message = errorToMessage(error);

    if (tempSessionId && tempSessionPath) {
      await teardownSession(deps, tempSessionId, tempSessionPath);
    }

    if (memoryBootstrapComplete) {
      deps.logger?.warn('[onboarding] Welcome launch failed after memory bootstrap:', message);
      return { kind: 'finished' };
    }

    if (isAuthError(message)) {
      try {
        const onboardingState = await deps.onboarding.getState();
        return { kind: 'auth-error', message, onboardingState };
      } catch (refreshError) {
        return { kind: 'error', message: errorToMessage(refreshError) };
      }
    }

    return { kind: 'error', message };
  }
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

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getLatestTurnFailure(
  deps: OnboardingLaunchRuntimeDeps,
  sessionId: string,
  sessionPath: string,
): Promise<string | null> {
  const { messages } = await deps.agent.open(sessionId, sessionPath, 'global');
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

async function applyModelEntry(
  deps: OnboardingLaunchRuntimeDeps,
  sessionId: string,
  entry: ModelTierEntry | null,
): Promise<boolean> {
  if (!entry) return false;

  try {
    await deps.agent.setModel(sessionId, entry.provider, entry.modelId);
    return true;
  } catch {
    // Fall through to lookup-by-model-id fallback.
  }

  try {
    const state = await deps.agent.getModelState(sessionId);
    if (!state) return false;

    const match = state.availableModels
      .flatMap((group) => group.models)
      .find((model) => model.modelId === entry.modelId);
    if (!match) return false;

    await deps.agent.setModel(sessionId, match.provider, match.modelId);
    return true;
  } catch {
    // Ignore — onboarding will recover via preflight on the next refresh.
  }

  return false;
}

async function applyTierModel(
  deps: OnboardingLaunchRuntimeDeps,
  sessionId: string,
  tiers: ModelTierSettings,
  tierOrder: readonly ModelTier[] = DEFAULT_TIER_ORDER,
): Promise<boolean> {
  for (const tier of tierOrder) {
    const entry = tiers[tier];
    if (entry) return applyModelEntry(deps, sessionId, entry);
  }
  return false;
}

async function createAndRunSession(
  deps: OnboardingLaunchRuntimeDeps,
  options: CreateAndRunSessionOptions,
): Promise<{ sessionId: string; sessionPath: string }> {
  const session = await deps.sessionStore.createSession('global');
  await deps.agent.open(session.id, session.path, 'global');

  if (options.name) {
    await deps.sessionStore.renameSession(session.id, options.name);
  }

  await applyTierModel(deps, session.id, options.tiers, options.tierOrder);

  if (options.thinkingLevel) {
    try {
      await deps.agent.setThinkingLevel(session.id, options.thinkingLevel);
    } catch {
      // Model may not support thinking levels — proceed with default.
    }
  }

  options.setupUi?.(session.id);

  await deps.agent.prompt(session.id, options.prompt);
  return { sessionId: session.id, sessionPath: session.path };
}

async function teardownSession(
  deps: OnboardingLaunchRuntimeDeps,
  sessionId: string,
  sessionPath: string,
): Promise<void> {
  try {
    await deps.agent.close(sessionId);
  } catch {
    // Session may already be closed.
  }
  try {
    await deps.sessionStore.deleteSession(sessionPath);
  } catch {
    // Best-effort cleanup.
  }
}
