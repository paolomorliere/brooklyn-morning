import { Settings } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { navigate } from './router';

export function ScreenHeader({ title, sub, right }: { title: string; sub?: ComponentChildren; right?: ComponentChildren }) {
  return (
    <header class="screen-header">
      <div>
        <h1>{title}</h1>
        {sub && <div class="sub">{sub}</div>}
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        {right}
        <button class="icon-btn" aria-label="Settings" onClick={() => navigate('settings')}>
          <Settings size={22} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
