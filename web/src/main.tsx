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
import { App } from './App';
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
