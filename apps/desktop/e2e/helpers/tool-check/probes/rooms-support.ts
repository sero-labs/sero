/**
 * What the `rooms` probe reads and does outside the tool: the Room's files on
 * disk, a bounded wait for an effect that lands after a call returns, the
 * Allow card the host shows, and the gate file that keeps the Conductor busy.
 *
 * The orchestrator keeps one folder per workspace
 * (`<workspace>/.sero/apps/orchestrator/rooms`, from runtime/rooms/room-paths.ts).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pageOf, waitUntil } from '../files';
import type { StepContext } from '../types';

export const ROOM_MODEL_NOTE = 'tc-room';

export interface ApprovalFile {
  id: string;
  kind: string;
  status: string;
}

export interface ArtifactFile {
  id: string;
  title: string;
}

export interface RoomFile {
  definition: { id: string; title: string; envelope: { maxCostUsd: number } };
  runtime: { status: string; stopReason: { kind: string } | null };
  approvals: ApprovalFile[];
  artifacts: ArtifactFile[];
  memberIds: string[];
}

export interface MemberFile {
  id: string;
  status: string;
  waitingOnQuestionId: string | null;
  configuration: { tools: string[] };
  usage: { turns: number };
}

export interface RevisionFile {
  id: string;
  kind: string;
  outcome: string;
  proposal: { kind: string; memberId?: string } | null;
  amendment?: { state: string };
}

export function roomsDir(ctx: StepContext): string {
  return path.join(ctx.workspacePath, '.sero', 'apps', 'orchestrator', 'rooms');
}

export function roomDir(ctx: StepContext, roomId: string): string {
  return path.join(roomsDir(ctx), roomId);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export const readRoom = (ctx: StepContext, roomId: string) => readJson<RoomFile>(path.join(roomDir(ctx, roomId), 'room.json'));
export const readMember = (ctx: StepContext, roomId: string, memberId: string) =>
  readJson<MemberFile>(path.join(roomDir(ctx, roomId), 'members', `${memberId}.json`));

export async function readRevisions(ctx: StepContext, roomId: string): Promise<RevisionFile[]> {
  return (await readJson<RevisionFile[]>(path.join(roomDir(ctx, roomId), 'revisions.json'))) ?? [];
}

/** The raw timeline, one JSON event per line. */
export async function timelineText(ctx: StepContext, roomId: string): Promise<string> {
  try {
    return await fs.readFile(path.join(roomDir(ctx, roomId), 'timeline.jsonl'), 'utf8');
  } catch {
    return '';
  }
}

export function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Waits for an effect that is written after the tool call returned, rechecking when a Room file changes. */
export function waitForRoom<T>(ctx: StepContext, what: string, read: () => Promise<T | undefined | null | false>, timeoutMs = 90_000): Promise<T> {
  return waitUntil(roomsDir(ctx), what, read, timeoutMs);
}

export const waitForRoomStatus = (ctx: StepContext, roomId: string, status: string) =>
  waitForRoom(ctx, `Room ${roomId} to be ${status}`, async () => (await readRoom(ctx, roomId))?.runtime.status === status);

/** The Room id that `prepare` printed: "Room <id> is ready to review". */
export function roomIdOf(ctx: StepContext): string {
  const id = ctx.state.roomId;
  must(typeof id === 'string', 'no step has prepared a Room yet');
  return id;
}

// -- The host's Allow card --------------------------------------------------

const presses = new Map<string, Promise<string>>();

/**
 * Presses the Allow card as soon as it shows. The tool call that raised the
 * card does not return until it is answered, so a step starts this in its
 * `setup` without waiting, and collects the result in its `expect`.
 */
/** The Allow choice: a plain question card numbers it ("1. Allow"), a contextual one does not. */
export const ALLOW = /^(\d+\. )?Allow$/;

export function startAllowPress(ctx: StepContext, key: string, timeoutMs = 90_000): void {
  presses.set(key, pageOf(ctx).getByRole('button', { name: ALLOW }).first()
    .click({ timeout: timeoutMs }).then(() => 'pressed', (error: unknown) => String(error)));
}

/** Waits for the press `startAllowPress` began. Fails unless it clicked a card. */
export async function finishAllowPress(key: string): Promise<void> {
  const outcome = await presses.get(key);
  presses.delete(key);
  must(outcome === 'pressed', `the Allow card never showed: ${outcome}`);
}

// -- The Conductor's hold ----------------------------------------------------

/** A folder the Conductor's command watches, so a Room question stays unanswered while the user acts. */
export function gateDir(ctx: StepContext): string {
  return path.join(ctx.workspacePath, '.sero', 'tc-room-gate');
}

export const gateOpenFile = (ctx: StepContext) => path.join(gateDir(ctx), 'open');
export const gateHoldingFile = (ctx: StepContext) => path.join(gateDir(ctx), 'holding');

/** The command the Conductor runs: it says it is holding, then exits when the gate opens. */
export function holdCommand(ctx: StepContext): string {
  const folder = ctx.runtime === 'host' ? gateDir(ctx) : '/workspace/.sero/tc-room-gate';
  const script = [
    "const fs=require('fs');",
    `const open=${JSON.stringify(path.join(folder, 'open'))};`,
    `const holding=${JSON.stringify(path.join(folder, 'holding'))};`,
    "const done=()=>{if(fs.existsSync(open))process.exit(0)};",
    `fs.mkdirSync(${JSON.stringify(folder)},{recursive:true});`,
    `fs.watch(${JSON.stringify(folder)},done);`,
    "fs.writeFileSync(holding,'1');",
    'done();',
  ].join('');
  return `node -e ${JSON.stringify(script)}`;
}

/** Waits until the Conductor is inside its hold. */
export function waitForHold(ctx: StepContext): Promise<true> {
  return waitUntil(gateDir(ctx), 'the Conductor to start holding', async () =>
    fs.access(gateHoldingFile(ctx)).then(() => true as const, () => false as const));
}

export async function openGate(ctx: StepContext): Promise<void> {
  await fs.mkdir(gateDir(ctx), { recursive: true });
  await fs.writeFile(gateOpenFile(ctx), '1');
}
