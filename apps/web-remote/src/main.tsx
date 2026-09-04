import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from '@/stores/theme';
import { hydrateLayout } from '@/stores/layout';
import { hydrateBoard } from '@/stores/board';
import { useConnectionStore } from '@/stores/connection';
import { installRemoteSeroBridge } from '@/lib/sero-bridge';
import { registerWorker } from '@/lib/push';
import './index.css';

// Apply the stored theme mode before the first paint.
initTheme();

// The shell renders with defaults until the stored layout arrives.
void hydrateLayout();

// The board shows every session as unread until the marks arrive.
void hydrateBoard();

// A federated widget expects `window.sero`. It is installed here, not in
// the connection store, because the bridge reaches back into the stores:
// installing it there would make the imports circular.
installRemoteSeroBridge(useConnectionStore.getState().client);

// The service worker makes the app installable and keeps its shell. It
// is registered whether or not the person ever turns notifications on.
void registerWorker();


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
