import { contextBridge } from 'electron';

// Expose a minimal API to the renderer.
// We'll expand this as we add real functionality.
contextBridge.exposeInMainWorld('sero', {
  platform: process.platform,
});
