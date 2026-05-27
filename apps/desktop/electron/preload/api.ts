import { userFeedbackBridge } from './platform/user-feedback';
import {
  clipboardBridge,
  feedbackBridge,
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
import { collaborationBridge } from './collaboration';
import { modelsBridge } from './agent/models';
import { localModelsBridge } from './agent/local-models';
import { imagegenBridge } from './integrations/imagegen';
import { modelConfigBridge, onboardingBridge } from './onboarding';
import {
  appStateBridge,
  appsBridge,
  appAgentBridge,
  gitAppBridge,
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

export const seroPreloadApi = {
  platform: process.platform,
  arch: process.arch,
  shell: shellBridge,
  profiles: profilesBridge,
  workspace: workspaceBridge,
  sessions: sessionsBridge,
  agent: agentBridge,
  contextPresets: contextPresetsBridge,
  appState: appStateBridge,
  apps: appsBridge,
  appAgent: appAgentBridge,
  gitApp: gitAppBridge,
  webApp: webAppBridge,
  browser: browserBridge,
  appControl: appControlBridge,
  models: modelsBridge,
  localModels: localModelsBridge,
  modelConfig: modelConfigBridge,
  onboarding: onboardingBridge,
  imagegen: imagegenBridge,
  pluginConfig: pluginConfigBridge,
  voice: voiceBridge,
  auth: authBridge,
  container: containerBridge,
  devServer: devServerBridge,
  vcs: vcsBridge,
  github: githubBridge,
  plugins: pluginsBridge,
  terminal: terminalBridge,
  layout: layoutBridge,
  themes: themesBridge,
  net: netBridge,
  safeStorage: safeStorageBridge,
  gateway: gatewayBridge,
  clipboard: clipboardBridge,
  feedback: feedbackBridge,
  collaboration: collaborationBridge,
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
