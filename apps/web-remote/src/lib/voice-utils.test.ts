import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanupRecordingRefs, teardownRecorder } from '@/lib/voice-utils';

interface FakeRecorder {
  state: 'inactive' | 'recording' | 'paused';
  ondataavailable: unknown;
  onerror: unknown;
  onstop: unknown;
  stop: ReturnType<typeof vi.fn>;
}

function makeRecorder(state: FakeRecorder['state']): FakeRecorder {
  return {
    state,
    ondataavailable: () => {},
    onerror: () => {},
    onstop: () => {},
    stop: vi.fn(function (this: FakeRecorder) {
      this.state = 'inactive';
    }),
  };
}

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}

interface FakeStream {
  tracks: FakeTrack[];
  getTracks: () => FakeTrack[];
}

function makeStream(trackCount = 1): FakeStream {
  const tracks: FakeTrack[] = Array.from({ length: trackCount }, () => ({
    stop: vi.fn(),
  }));
  return {
    tracks,
    getTracks: () => tracks,
  };
}

describe('voice-utils teardownRecorder', () => {
  it('detaches handlers and stops an active recorder', () => {
    const recorder = makeRecorder('recording');

    teardownRecorder(recorder as unknown as MediaRecorder);

    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onerror).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('detaches handlers but does not stop an already-inactive recorder', () => {
    const recorder = makeRecorder('inactive');

    teardownRecorder(recorder as unknown as MediaRecorder);

    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('swallows stop() errors so cleanup never throws', () => {
    const recorder = makeRecorder('recording');
    recorder.stop = vi.fn(() => {
      throw new DOMException('not stoppable');
    });

    expect(() =>
      teardownRecorder(recorder as unknown as MediaRecorder),
    ).not.toThrow();
    expect(recorder.onstop).toBeNull();
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when given null', () => {
    expect(() => teardownRecorder(null)).not.toThrow();
  });
});

describe('voice-utils cleanupRecordingRefs (disconnect-while-recording)', () => {
  let originalClearInterval: typeof window.clearInterval;
  let clearIntervalSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearIntervalSpy = vi.fn();
    originalClearInterval = window.clearInterval;
    (window as unknown as { clearInterval: typeof clearInterval }).clearInterval =
      clearIntervalSpy as unknown as typeof clearInterval;
  });

  afterEach(() => {
    (window as unknown as { clearInterval: typeof clearInterval }).clearInterval = originalClearInterval;
  });

  it('clears the timer, stops the recorder, stops every stream track, and nulls refs', () => {
    const recorder = makeRecorder('recording');
    const stream = makeStream(2);
    const recorderRef = { current: recorder as unknown as MediaRecorder };
    const streamRef = { current: stream as unknown as MediaStream };
    const timerRef: { current: number | null } = { current: 7 };

    cleanupRecordingRefs({ recorderRef, streamRef, timerRef });

    // Timer was active and is now cleared.
    expect(clearIntervalSpy).toHaveBeenCalledWith(7);
    expect(timerRef.current).toBeNull();

    // Recorder was stopped and its handlers detached so a late onstop
    // can't fire and try to upload through the (now-gone) gateway.
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.ondataavailable).toBeNull();
    expect(recorder.onstop).toBeNull();
    expect(recorderRef.current).toBeNull();

    // Every microphone track was released.
    for (const track of stream.tracks) {
      expect(track.stop).toHaveBeenCalledTimes(1);
    }
    expect(streamRef.current).toBeNull();
  });

  it('is safe to call when there is nothing to clean up', () => {
    const recorderRef: { current: MediaRecorder | null } = { current: null };
    const streamRef: { current: MediaStream | null } = { current: null };
    const timerRef: { current: number | null } = { current: null };

    expect(() =>
      cleanupRecordingRefs({ recorderRef, streamRef, timerRef }),
    ).not.toThrow();
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });
});
