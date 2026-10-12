import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled, not fetched from a CDN: the weights the legacy page asked Google Fonts for.
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '@fontsource/pirata-one/400.css';
import './styles/tokens.css';
import './styles/tavern.css';
import './styles/online.css';
import './styles/gameon.css';
import './styles/skullking.css';
import './styles/responsive.css';
import { App } from './App';
import { registerWorker } from './pwa';
import { loadMusic } from './sound/music';
import { loadSamples } from './sound/samples';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// The recorded card sounds. Nothing waits for them: the table plays the synthesised ones until they are in.
void loadSamples();
// Installable, and able to open with no network: see src/sw.ts.
registerWorker();
// The menu music. The home screen is up before it is in, and stays quiet if it never arrives.
void loadMusic();
