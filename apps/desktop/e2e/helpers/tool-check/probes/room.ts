/**
 * The `room` tool, which only a Room member may call; any other session is
 * refused. Its steps run in the reviewer of the Room the `rooms` probe builds,
 * through `sero-cli` as a member reaches it. The runner (../room-member.ts)
 * starts the two together.
 */
import fs from 'node:fs/promises';
import { expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { must, readRoom, roomsDir, timelineText } from './rooms-support';
import { ADJUSTED_TITLE } from './rooms-stub';

const STATUS = 'tc-reviewer-status';

/** The Room the `rooms` probe made: the only one in the workspace while it runs. */
export async function onlyRoomId(ctx: StepContext): Promise<string> {
  const ids: string[] = [];
  for (const id of await fs.readdir(roomsDir(ctx)).catch(() => [])) {
    if ((await readRoom(ctx, id))?.definition.title === ADJUSTED_TITLE) ids.push(id);
  }
  must(ids.length === 1, `expected the rooms probe's one Room, found ${ids.length}`);
  return ids[0]!;
}

export const roomProbe: ToolProbe = {
  tool: 'room',
  steps: [
    {
      action: null,
      params: { command: 'show-roster' },
      expect: (result) => {
        expectText(result, `Room "${ADJUSTED_TITLE}"`);
        expectText(result, 'Members:');
      },
    },
    {
      action: null,
      params: { command: 'report-status', body: STATUS },
      async expect(result, ctx) {
        expectText(result, 'Status recorded for the Room.');
        const timeline = await timelineText(ctx, await onlyRoomId(ctx));
        must(timeline.includes(`Tc Reviewer: ${STATUS}`), 'the status line is not in the Room timeline');
      },
    },
  ],
};

