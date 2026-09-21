// @vitest-environment jsdom

/**
 * Activity that cannot be read is not activity that did not happen.
 *
 * The captured defect: with the Rooms runtime off, a Room whose record had
 * ninety-nine saved events showed "Nothing has happened yet."
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomTimelineEvent } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import { RoomActivity } from '../components/RoomActivity';

const NO_MEMBERS = new Map<string, RoomMember>();

describe('RoomActivity when there is nothing to show', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const render = (events: RoomTimelineEvent[], savedEvents: number) => act(() =>
    root.render(<RoomActivity events={events} members={NO_MEMBERS} savedEvents={savedEvents} />));

  it('says the activity is not available, and how much is saved', () => {
    render([], 99);
    const text = container.textContent ?? '';
    expect(text).toContain('Activity is not available now.');
    expect(text).toContain('99 events are saved');
    expect(text).not.toContain('Nothing has happened yet.');
  });

  it('still says nothing has happened for a Room that really is new', () => {
    render([], 0);
    expect(container.textContent).toContain('Nothing has happened yet.');
  });

  it('uses no colour for either, because neither is a fault', () => {
    render([], 99);
    const line = container.querySelector('p');
    expect(line?.className).toContain('text-room-text4');
    expect(line?.className).not.toMatch(/status-error|status-warn|amber|destructive/);
  });
});
