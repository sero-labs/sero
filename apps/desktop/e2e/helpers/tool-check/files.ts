import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepContext } from './types';

/** Writes a file into the workspace from the test process. */
export async function putFile(ctx: StepContext, relative: string, content: string): Promise<void> {
  const target = path.join(ctx.workspacePath, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

/** Reads a workspace file from the test process, or null when it is not there. */
export async function fileText(ctx: StepContext, relative: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(ctx.workspacePath, relative), 'utf8');
  } catch {
    return null;
  }
}

/** Fails unless the workspace file holds exactly `expected`. */
export async function expectFile(ctx: StepContext, relative: string, expected: string): Promise<void> {
  const actual = await fileText(ctx, relative);
  if (actual !== expected) throw new Error(`${relative} holds ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

/** The app window, for a step that needs it. */
export function pageOf(ctx: StepContext) {
  if (!ctx.page) throw new Error('this step needs the app window');
  return ctx.page;
}
