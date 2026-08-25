export interface NodeEvent { type: string; data: unknown }

export class EventHub {
  readonly #listeners = new Map<string, Set<(event: NodeEvent) => void>>();

  emit(channel: string, event: NodeEvent): void {
    for (const listener of this.#listeners.get(channel) ?? []) listener(event);
  }

  subscribe(channel: string, listener: (event: NodeEvent) => void): () => void {
    const listeners = this.#listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(channel, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(channel);
    };
  }
}

export function sseStream(initial: NodeEvent[], subscribe: (send: (event: NodeEvent) => void) => () => void, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  return new ReadableStream({
    start(controller) {
      const send = (event: NodeEvent) => controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
      initial.forEach(send);
      unsubscribe = subscribe(send);
      signal.addEventListener("abort", () => { unsubscribe(); controller.close(); }, { once: true });
    },
    cancel() { unsubscribe(); },
  });
}
