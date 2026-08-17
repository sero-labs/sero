import { describe, expect, it } from 'vitest';
import { createRoomRuntimeTelemetry } from '../rooms/room-telemetry';

describe('Room runtime telemetry', () => {
  it('reports bounded p95 wake latency without recording content', () => {
    const logs: string[] = [];
    const telemetry = createRoomRuntimeTelemetry((line) => logs.push(line));
    for (let sample = 1; sample <= 20; sample += 1) {
      telemetry.markWake('room-a', 'member-a', new Date(sample * 10_000).toISOString());
      telemetry.markTurnStart('room-a', 'member-a', new Date(sample * 10_000 + sample * 100).toISOString());
    }

    expect(telemetry.snapshot()).toEqual({ wakeSamples: 20, wakeLatencyP95Ms: 1_900 });
    expect(logs.at(-1)).toBe('room metric wake_latency_ms=2000 room=room-a member=member-a');
    expect(logs.join('\n')).not.toContain('prompt');
  });

  it('ignores ordinary turn starts and keeps only the latest thousand samples', () => {
    const telemetry = createRoomRuntimeTelemetry(() => undefined);
    telemetry.markTurnStart('room-a', 'member-a', new Date(0).toISOString());
    for (let sample = 0; sample < 1_010; sample += 1) {
      telemetry.markWake('room-a', 'member-a', new Date(sample * 10).toISOString());
      telemetry.markTurnStart('room-a', 'member-a', new Date(sample * 10 + 1).toISOString());
    }
    expect(telemetry.snapshot()).toEqual({ wakeSamples: 1_000, wakeLatencyP95Ms: 1 });
  });
});
