export interface KeepAliveScheduler {
  start(): void;
  stop(): void;
}

export function createKeepAliveScheduler(options: {
  intervalMs: number;
  isEnabled: () => boolean;
  onTick: () => Promise<void>;
}): KeepAliveScheduler {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (running || !options.isEnabled()) {
          return;
        }
        running = true;
        void options.onTick().finally(() => {
          running = false;
        });
      }, options.intervalMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      running = false;
    },
  };
}
