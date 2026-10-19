import type { ToolProbe } from '../types';
import { cronProbe, currentTimeProbe } from './cron';
import { memoryProbe, scratchpadProbe } from './memory';
import { outputOptimizerProbe } from './output-optimizer';
import { reminderProbe } from './reminder';
import { findProbe, grepProbe, multiGrepProbe } from './search';
import { usageProbe } from './usage';

export const cronMemoryProbes: ToolProbe[] = [
  currentTimeProbe,
  cronProbe,
  reminderProbe,
  memoryProbe,
  scratchpadProbe,
  usageProbe,
  outputOptimizerProbe,
  findProbe,
  grepProbe,
  multiGrepProbe,
];
