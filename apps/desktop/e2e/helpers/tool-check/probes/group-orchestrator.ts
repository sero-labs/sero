import type { ToolProbe } from '../types';
import { goalProbe } from './goal';
import { orchestratorProbe } from './orchestrator';

/**
 * `orchestrator` first: it ends with every loop it made deleted. `goal` makes
 * one goal in its own chat session and stops it.
 */
export const orchestratorProbes: ToolProbe[] = [orchestratorProbe, goalProbe];
