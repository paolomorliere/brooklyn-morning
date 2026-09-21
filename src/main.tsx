import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import '@/styles/global.css';
import '@/styles/home.css';
import '@/styles/todo.css';
import '@/styles/groceries.css';
import { App } from './App';

// Service worker: check for a new build whenever the app comes back to the foreground (iOS keeps the old page alive),
// and at most once an hour while open. A new version installs silently and the page reloads when it takes over.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => void reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 60 * 60_000);
  },
  onNeedRefresh() {
    void updateSW(true);
  },
});

render(<App />, document.getElementById('app')!);
