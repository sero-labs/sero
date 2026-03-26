/**
 * IPC handler registry.
 *
 * Each domain exports a register function. Call registerAllIpcHandlers()
 * once from main.ts on startup. To add a new domain, create a file in
 * the appropriate subdirectory and add its registration call below.
 */

// Agent
import { registerAgentHandlers } from './agent/agent';
import { registerSessionHandlers } from './agent/sessions';
import { registerSubagentHandlers } from './agent/subagent';
import { registerSkillHandlers } from './agent/skills';

// Workspace & Apps
import { registerWorkspaceHandlers } from './workspace/workspace';
import { registerAppsHandlers } from './workspace/apps';
import { registerAppStateHandlers } from './workspace/app-state';
import { registerAppAgentHandlers } from './workspace/app-agent';
import { registerAppControlHandlers } from './workspace/app-control';
import { registerFileTreeHandlers } from './workspace/filetree';
import { registerEditorHandlers } from './workspace/editor';

// Infrastructure
import { registerContainerHandlers } from './infra/container';
import { registerTerminalHandlers } from './infra/terminal';
import { registerShellHandlers } from './infra/shell';
import { registerDevServerHandlers } from './infra/dev-server';
import { registerLspHandlers } from './infra/lsp';
import { registerDebugHandlers } from './infra/debug';

// Auth & External Services
import { registerAuthHandlers } from './auth/auth';
import { registerGitHubHandlers } from './auth/github';
import { registerGoogleApiHandlers } from './auth/google-api';
import { registerSafeStorageHandlers } from './auth/safe-storage';
import { registerProfileHandlers } from './auth/profiles';

// UI, Layout & Media
import { registerLayoutHandlers } from './ui/layout';
import { registerThemeHandlers } from './ui/themes';
import { registerModelsHandlers } from './ui/models';
import { registerPromptHandlers } from './ui/prompts';
import { registerContextPresetsHandlers } from './ui/context-presets';
import { registerVoiceHandlers } from './ui/voice';
import { registerImagegenHandlers } from './ui/imagegen';
import { registerFeedbackHandlers } from './ui/feedback';
import { registerUserFeedbackQuestionHandlers } from './ui/user-feedback-questions';

// Collaboration
import { registerCollaborationHandlers } from './collaboration/collaboration';

// VCS & Git
import { registerVcsHandlers } from './vcs/vcs';
import { registerGitAppHandlers } from './vcs/git-app';

// Gateway
import { registerGatewayHandlers } from './gateway/gateway';

// Plugins & Networking
import { registerPluginHandlers } from './plugins/plugins';
import { registerNetHandlers } from './plugins/net';

export function registerAllIpcHandlers(): void {
  // Agent
  registerAgentHandlers();
  registerSessionHandlers();
  registerSubagentHandlers();
  registerSkillHandlers();

  // Workspace & Apps
  registerWorkspaceHandlers();
  registerAppsHandlers();
  registerAppStateHandlers();
  registerAppAgentHandlers();
  registerAppControlHandlers();
  registerFileTreeHandlers();
  registerEditorHandlers();

  // Infrastructure
  registerContainerHandlers();
  registerTerminalHandlers();
  registerShellHandlers();
  registerDevServerHandlers();
  registerLspHandlers();
  registerDebugHandlers();

  // Auth & External Services
  registerAuthHandlers();
  registerGitHubHandlers();
  registerGoogleApiHandlers();
  registerSafeStorageHandlers();
  registerProfileHandlers();

  // UI, Layout & Media
  registerLayoutHandlers();
  registerThemeHandlers();
  registerModelsHandlers();
  registerPromptHandlers();
  registerContextPresetsHandlers();
  registerVoiceHandlers();
  registerImagegenHandlers();
  registerFeedbackHandlers();
  registerUserFeedbackQuestionHandlers();

  // Collaboration
  registerCollaborationHandlers();

  // VCS & Git
  registerVcsHandlers();
  registerGitAppHandlers();

  // Gateway
  registerGatewayHandlers();

  // Plugins & Networking
  registerPluginHandlers();
  registerNetHandlers();
}
