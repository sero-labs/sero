export interface NodeEvent { type: string; data: unknown; id?: string }

interface Subscription {
  listener: (event: NodeEvent) => void;
  controllerId?: string;
  close?: () => void;
}

export interface BufferedSubscription {
  activate(listener: (event: NodeEvent) => void, close?: () => void): () => void;
  unsubscribe(): void;
}

export class EventHub {
  readonly #listeners = new Map<string, Set<Subscription>>();

  emit(channel: string, event: NodeEvent): void {
    for (const subscription of this.#listeners.get(channel) ?? []) subscription.listener(event);
  }

  subscribe(channel: string, listener: (event: NodeEvent) => void, controllerId?: string, close?: () => void): () => void {
    const listeners = this.#listeners.get(channel) ?? new Set();
    const subscription = { listener, controllerId, close };
    listeners.add(subscription);
    this.#listeners.set(channel, listeners);
    return () => {
      listeners.delete(subscription);
      if (listeners.size === 0) this.#listeners.delete(channel);
    };
  }

  subscribeBuffered(channel: string, controllerId?: string, close?: () => void): BufferedSubscription {
    const pending: NodeEvent[] = [];
    let listener: ((event: NodeEvent) => void) | undefined;
    let activeClose = close;
    const unsubscribe = this.subscribe(channel, (event) => {
      if (listener) listener(event);
      else pending.push(event);
    }, controllerId, () => activeClose?.());
    return {
      activate(next, onClose) {
        for (const event of pending) next(event);
        pending.length = 0;
        listener = next;
        activeClose = onClose ?? close;
        return unsubscribe;
      },
      unsubscribe,
    };
  }

  disconnectController(controllerId: string): void {
    for (const [channel, listeners] of this.#listeners) {
      for (const subscription of [...listeners]) {
        if (subscription.controllerId !== controllerId) continue;
        listeners.delete(subscription);
        subscription.close?.();
      }
      if (listeners.size === 0) this.#listeners.delete(channel);
    }
  }
}

export function sseStream(initial: NodeEvent[], subscribe: (send: (event: NodeEvent) => void, close: () => void) => () => void, signal: AbortSignal, onClose?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  return new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => { if (closed) return; closed = true; unsubscribe(); onClose?.(); controller.close(); };
      const send = (event: NodeEvent) => {
        if (closed) return;
        const id = event.id ? `id: ${event.id}\n` : "";
        controller.enqueue(encoder.encode(`${id}event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
      };
      initial.forEach(send);
      unsubscribe = subscribe(send, close);
      signal.addEventListener("abort", close, { once: true });
    },
    cancel() { unsubscribe(); onClose?.(); },
  });
}
