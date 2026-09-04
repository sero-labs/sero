import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from '@/stores/theme';
import { hydrateLayout } from '@/stores/layout';
import { hydrateBoard } from '@/stores/board';
import './index.css';

// Apply the stored theme mode before the first paint.
initTheme();

// The shell renders with defaults until the stored layout arrives.
void hydrateLayout();

// The board shows every session as unread until the marks arrive.
void hydrateBoard();


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
