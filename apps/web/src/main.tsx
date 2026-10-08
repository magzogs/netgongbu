import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useViewer } from './store/viewer';
import './styles.css';

// Dev only: drive playback from the browser console, e.g. viewer.getState().play().
if (import.meta.env.DEV) Object.assign(window, { viewer: useViewer });

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
