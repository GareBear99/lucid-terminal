import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MiniBrowser from './components/Browser/MiniBrowser';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Mini window mode (Area 6): the floating browser window loads the
// same renderer with `?mini=browser` and renders only the compact
// browser - no terminal, no AI chat, no synth. The popped-out tab's
// BrowserView is positioned over MiniBrowser's container by the
// main process, exactly like the panel's BrowserPanel.
const isMiniBrowser =
  new URLSearchParams(window.location.search).get('mini') === 'browser';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isMiniBrowser ? <MiniBrowser /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
