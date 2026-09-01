import { userFeedbackBridge } from './platform/user-feedback';
import { windowBridge } from './platform/window';
import {
  clipboardBridge,
  feedbackBridge,
  dashboardBridge,
  gatewayBridge,
  layoutBridge,
  netBridge,
  pluginConfigBridge,
  safeStorageBridge,
  themesBridge,
} from './platform/host-services';
import { debugBridge, lspBridge } from './editor/debug-lsp';
import { subagentBridge } from './agent/subagent';
import { skillsBridge } from './agent/skills';
import { promptsBridge } from './agent/prompts';
import { modelsBridge } from './agent/models';
import { subagentContextBridge } from './agent/subagent-context';
import { localModelsBridge } from './agent/local-models';
import { modelConfigBridge, onboardingBridge } from './onboarding';
import {
  appStateBridge,
  appsBridge,
  appAgentBridge,
  webAppBridge,
  appControlBridge,
  voiceBridge,
  authBridge,
  containerBridge,
  devServerBridge,
  githubBridge,
} from './apps/app-domain';
import { browserBridge } from './apps/browser';
import { pluginsBridge } from './integrations/plugins';
import { agentPluginsBridge } from './integrations/agent-plugins';
import { orchestratorBridge } from './integrations/orchestrator';
import { worktreePoolBridge } from './integrations/worktree-pool';
import {
  agentBridge,
  contextPresetsBridge,
  profilesBridge,
  sessionsBridge,
  shellBridge,
  workspaceBridge,
} from './api/core';
import { editorBridge, filetreeBridge, terminalBridge, vcsBridge } from './api/workbench';
import { doctorBridge } from './diagnostics';
import { updaterBridge } from './updater';
import { agentNodesBridge } from './agent-node';

export const seroPreloadApi = {
  platform: process.platform,
  arch: process.arch,
  window: windowBridge,
  shell: shellBridge,
  profiles: profilesBridge,
  workspace: workspaceBridge,
  sessions: sessionsBridge,
  agent: agentBridge,
  agentNodes: agentNodesBridge,
  contextPresets: contextPresetsBridge,
  appState: appStateBridge,
  apps: appsBridge,
  appAgent: appAgentBridge,
  webApp: webAppBridge,
  browser: browserBridge,
  appControl: appControlBridge,
  models: modelsBridge,
  subagentContext: subagentContextBridge,
  localModels: localModelsBridge,
  modelConfig: modelConfigBridge,
  onboarding: onboardingBridge,
  pluginConfig: pluginConfigBridge,
  voice: voiceBridge,
  auth: authBridge,
  container: containerBridge,
  devServer: devServerBridge,
  vcs: vcsBridge,
  orchestrator: orchestratorBridge,
  worktreePool: worktreePoolBridge,
  github: githubBridge,
  plugins: pluginsBridge,
  agentPlugins: agentPluginsBridge,
  terminal: terminalBridge,
  layout: layoutBridge,
  dashboard: dashboardBridge,
  themes: themesBridge,
  net: netBridge,
  safeStorage: safeStorageBridge,
  gateway: gatewayBridge,
  clipboard: clipboardBridge,
  feedback: feedbackBridge,
  subagent: subagentBridge,
  skills: skillsBridge,
  prompts: promptsBridge,
  userFeedback: userFeedbackBridge,
  editor: editorBridge,
  filetree: filetreeBridge,
  debug: debugBridge,
  lsp: lspBridge,
  doctor: doctorBridge,
  updater: updaterBridge,
};
