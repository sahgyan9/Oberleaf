import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './context/ThemeContext';
import { adoptSessionTokenFromUrl } from './session';
import 'katex/dist/katex.min.css';
import './index.css';

// Must run before the first API call: an invite link's token becomes a cookie
// that every subsequent request (fetch, <img>, pdf.js) carries automatically.
adoptSessionTokenFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
