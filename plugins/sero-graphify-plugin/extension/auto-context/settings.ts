import { readStateFile } from '../../shared/state-io';
import { DEFAULT_STATE, type AutoContextSettings } from '../../shared/types';

export async function loadAutoContextSettings(stateFile: string): Promise<AutoContextSettings> {
  const state = await readStateFile(stateFile);
  return state?.settings.autoContext ?? DEFAULT_STATE.settings.autoContext;
}

/** Pi-graphify defaults kept as local constants (not user-configurable in v1). */
export const MIN_TOOL_RESULT_LINES = 8;
export const REPORT_MAX_CHARS = 6000;
export const QUERY_BUDGET = 1200;
export const TRIGGER_TOOLS = new Set(['grep', 'ffgrep', 'find', 'fffind', 'read']);
export const TRIGGER_PATTERNS = [
  'architecture',
  'layer',
  'component',
  'module',
  'subsystem',
  'pipeline',
  'community',
  'cluster',
  'relate',
  'connect',
  'depends',
  'touches',
  'nearby',
  'impact',
  'cross-file',
  'system',
  'graph',
  'graphify',
  'knowledge graph',
  'GRAPH_REPORT',
];
