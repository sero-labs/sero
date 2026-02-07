import './monaco-setup';  // Must be first — configures Monaco workers before any Editor mounts
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

// No StrictMode — it double-mounts components in dev, which creates
// duplicate PTY sessions, terminal connections, and agent subscriptions.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

