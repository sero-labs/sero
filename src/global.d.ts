import type { SeroAPI } from '../electron/preload';

declare global {
  interface Window {
    sero: SeroAPI;
  }
}

export {};
