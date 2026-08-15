export interface RoomTelemetrySnapshot {
  wakeSamples: number;
  wakeLatencyP95Ms: number | null;
}

export interface RoomRuntimeTelemetry {
  markWake(roomId: string, memberId: string, at: string): void;
  markTurnStart(roomId: string, memberId: string, at: string): void;
  snapshot(): RoomTelemetrySnapshot;
}

const MAX_SAMPLES = 1_000;

/** Captures bounded local runtime metrics without prompt or message content. */
export function createRoomRuntimeTelemetry(log: (message: string) => void): RoomRuntimeTelemetry {
  const wakes = new Map<string, number>();
  const latencies: number[] = [];
  const keyOf = (roomId: string, memberId: string) => `${roomId}:${memberId}`;

  return {
    markWake(roomId, memberId, at) {
      const timestamp = Date.parse(at);
      if (Number.isFinite(timestamp)) wakes.set(keyOf(roomId, memberId), timestamp);
    },
    markTurnStart(roomId, memberId, at) {
      const key = keyOf(roomId, memberId);
      const started = Date.parse(at);
      const woke = wakes.get(key);
      if (woke === undefined || !Number.isFinite(started)) return;
      wakes.delete(key);
      const latencyMs = Math.max(0, started - woke);
      latencies.push(latencyMs);
      if (latencies.length > MAX_SAMPLES) latencies.shift();
      log(`room metric wake_latency_ms=${latencyMs} room=${roomId} member=${memberId}`);
    },
    snapshot() {
      if (latencies.length === 0) return { wakeSamples: 0, wakeLatencyP95Ms: null };
      const sorted = [...latencies].sort((a, b) => a - b);
      const index = Math.ceil(sorted.length * 0.95) - 1;
      return { wakeSamples: latencies.length, wakeLatencyP95Ms: sorted[index] };
    },
  };
}
