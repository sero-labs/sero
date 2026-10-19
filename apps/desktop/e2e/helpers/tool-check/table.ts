import type { ToolProbe } from './types';
import { writeProbe } from './probes/write';

/** One probe per tool. The coverage check fails when this falls behind the tools. */
export const TOOL_PROBES: ToolProbe[] = [
  writeProbe,
];
