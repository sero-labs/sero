import './lib/performance-measure-guard';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './styles/global.css';

// No StrictMode, it double-mounts components in dev, which creates
// duplicate PTY sessions, terminal connections, and agent subscriptions.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary region="Sero">
    <App />
  </ErrorBoundary>,
);

