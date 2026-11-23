import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyBrandIcon, BRAND } from './components/ui';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');
applyBrandIcon(BRAND, document);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
