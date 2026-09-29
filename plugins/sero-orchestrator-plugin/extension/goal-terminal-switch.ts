/**
 * The three goal terminal tools exist only while a goal is attached to the
 * session. With no goal they fail with a caller error and cost about 1,000
 * characters of schema in every request.
 *
 * The switch never widens a session. It claims the tools at session start only
 * when the session already had all three active. A session whose tool policy
 * or allowlist excludes them never gets them, and the goal pause in
 * goal-loop.ts covers that case. Activation adds exactly the three names to
 * the tools that are active now, so a tool the user disabled stays disabled.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { GOAL_TERMINAL_TOOLS } from '../shared/goal-defaults';

export interface TerminalToolSwitch {
  /** Call at session start, before any goal is looked up. */
  claim(): void;
  /** Turn the terminal tools on for a goal that is running, or off when none is. */
  set(on: boolean): void;
  /** The session's tools as a goal must see them: held-back terminal tools count as reachable. */
  reachableTools(): string[];
}

/**
 * D07: goal mode never widens what the agent may do, and it never runs without
 * a way to stop. A tool policy that hides a terminal tool makes the goal
 * unstoppable, so the goal pauses instead of the policy being widened.
 */
export function hiddenTerminalTools(activeTools: string[]): string[] {
  return GOAL_TERMINAL_TOOLS.filter((name) => !activeTools.includes(name));
}

export function createTerminalToolSwitch(pi: ExtensionAPI): TerminalToolSwitch {
  const isTerminal = (name: string) => (GOAL_TERMINAL_TOOLS as readonly string[]).includes(name);
  let claimed = false;
  let on = false;

  return {
    claim() {
      const active = pi.getActiveTools();
      claimed = hiddenTerminalTools(active).length === 0;
      on = false;
      if (claimed) pi.setActiveTools(active.filter((name) => !isTerminal(name)));
    },
    set(next) {
      if (!claimed) return;
      // Adding the tools only when they turn on keeps a tool the user disables mid-goal disabled.
      if (next === on) return;
      on = next;
      const active = pi.getActiveTools();
      const others = active.filter((name) => !isTerminal(name));
      pi.setActiveTools(next ? [...others, ...GOAL_TERMINAL_TOOLS] : others);
    },
    reachableTools() {
      const active = pi.getActiveTools();
      return claimed ? [...active, ...GOAL_TERMINAL_TOOLS] : active;
    },
  };
}
