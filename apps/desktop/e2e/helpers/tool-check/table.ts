import type { ToolProbe } from './types';
import { bashProbe } from './probes/bash';
import { editProbe } from './probes/edit';
import { readProbe } from './probes/read';
import { seroAppstateProbe } from './probes/sero-appstate';
import { seroArtifactsProbe } from './probes/sero-artifacts';
import { seroCliProbe } from './probes/sero-cli';
import { seroDevserverProbe } from './probes/sero-devserver';
import { seroEditorProbe } from './probes/sero-editor';
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
];
