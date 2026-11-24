import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createServices } from './services';
import { apiIsUp } from './services/apiProbe';
import { parseDemoData, resolveDemoData } from './services/demoData';
import { applyBrandIcon, BRAND } from './components/ui';

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');
applyBrandIcon(BRAND, document);

/**
 * The services the app uses: VITE_DEMO_DATA's choice while the api is up; every sample (each marked Demo data) when
 * the api doesn't answer at start-up (demo-local4); never sample data in a production build.
 */
async function start(mount: HTMLElement) {
  const production = import.meta.env.PROD;
  const chosen = parseDemoData(import.meta.env.VITE_DEMO_DATA, { production });
  const probe = createServices(undefined, { demo: chosen });
  const apiUp = production || (await apiIsUp(() => probe.health.get()));
  const services = createServices(undefined, { demo: resolveDemoData(chosen, { production, apiUp }) });
  createRoot(mount).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}

void start(root);
