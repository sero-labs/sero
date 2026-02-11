/** Types for the `window.sero` API exposed by the preload script. */
interface SeroAPI {
  platform: string;
}

declare global {
  interface Window {
    sero?: SeroAPI;
  }
}

export {};
