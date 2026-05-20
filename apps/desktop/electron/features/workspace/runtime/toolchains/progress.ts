import type { ToolchainProgressEvent } from './types';

export type ToolchainProgressListener = (event: ToolchainProgressEvent) => void;

export class ToolchainProgressBus {
  private readonly listeners = new Set<ToolchainProgressListener>();

  subscribe(listener: ToolchainProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ToolchainProgressEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
