import { cronMemoryProbes } from './probes/group-cron-memory';
import { designLibraryProbes } from './probes/group-design-library';
import { gitGraphifyProbes } from './probes/group-git-graphify';
import { mcpProbes } from './probes/group-mcp';
import { webFeedbackProbes } from './probes/group-web-feedback';
import type { ToolProbe } from './types';
import { bashProbe } from './probes/bash';
import { editProbe } from './probes/edit';
import { readProbe } from './probes/read';
import { seroAppProbe } from './probes/sero-app';
import { seroAppstateProbe } from './probes/sero-appstate';
import { seroArtifactsProbe } from './probes/sero-artifacts';
import { seroBrowserProbe } from './probes/sero-browser';
import { seroCliProbe } from './probes/sero-cli';
import { seroDevserverProbe } from './probes/sero-devserver';
import { seroEditorProbe } from './probes/sero-editor';
import { seroGitProbe, seroVcsProbe } from './probes/sero-git';
import { seroHelpProbe } from './probes/sero-help';
import { seroSessionProbe } from './probes/sero-session';
import { seroSetTitleProbe } from './probes/sero-set-title';
import { seroTerminalProbe } from './probes/sero-terminal';
import { seroWorkspaceProbe } from './probes/sero-workspace';
import { writeProbe } from './probes/write';

/** One probe per tool. The coverage check fails when this falls behind the tools. */
export const TOOL_PROBES: ToolProbe[] = [
  bashProbe,
  readProbe,
  writeProbe,
  editProbe,
  seroCliProbe,
  seroHelpProbe,
  seroSessionProbe,
  seroSetTitleProbe,
  seroEditorProbe,
  seroTerminalProbe,
  seroArtifactsProbe,
  seroAppstateProbe,
  seroWorkspaceProbe,
  seroDevserverProbe,
  seroGitProbe,
  seroVcsProbe,
  seroBrowserProbe,
  seroAppProbe,
  ...cronMemoryProbes,
  ...webFeedbackProbes,
  ...gitGraphifyProbes,
  ...mcpProbes,
  ...designLibraryProbes,
];
