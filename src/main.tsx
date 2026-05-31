import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { restoreTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/index.css';

restoreTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
