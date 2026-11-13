import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MiniBrowser from './components/Browser/MiniBrowser';
import MiniTerminal from './components/Terminal/MiniTerminal';
import MiniFiles from './components/Editor/MiniFiles';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Mini window mode (Area 6): the floating browser window loads the
// same renderer with `?mini=browser` and renders only the compact
// browser - no terminal, no AI chat, no synth. The popped-out tab's
// BrowserView is positioned over MiniBrowser's container by the
// main process, exactly like the panel's BrowserPanel.
// Mini window mode (Area 6 + tab detach, Gary 2026-11-09): the
// floating browser window and the detached terminal / files
// windows all load the same renderer with `?mini=<kind>` and
// render only their compact screen — no full app.
const miniParam = new URLSearchParams(window.location.search).get('mini');
const isMiniBrowser = miniParam === 'browser';
const isMiniTerminal = miniParam === 'terminal';
const isMiniFiles = miniParam === 'files';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isMiniBrowser ? (
        <MiniBrowser />
      ) : isMiniTerminal ? (
        <MiniTerminal />
      ) : isMiniFiles ? (
        <MiniFiles />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
