import { useEffect, useRef } from 'react';
import { mountTavern } from './tableview';

/**
 * The game table. React renders the two empty elements once and never looks inside them:
 * the legacy renderer owns #app (it rebuilds it from HTML strings) and draws confetti on #fx.
 */
export function App() {
  const app = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!app.current || !fx.current) return;
    return mountTavern(app.current, fx.current);
  }, []);
  return (
    <>
      <div id="app" ref={app}></div>
      <canvas id="fx" ref={fx} hidden></canvas>
    </>
  );
}
