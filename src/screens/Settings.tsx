import { ChevronLeft } from 'lucide-preact';
import { BackupSection } from './settings/BackupSection';
import { GrocerySection } from './settings/GrocerySection';

function Row({ label, value, action }: { label: string; value?: string; action?: string }) {
  return (
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)">
      <div>
        <div>{label}</div>
        {value && <div class="small muted">{value}</div>}
      </div>
      {action && <button class="btn btn--quiet" style="color:var(--terracotta-deep)">{action}</button>}
    </div>
  );
}

export function Settings() {
  return (
    <main class="screen">
      <header class="screen-header" style="align-items:center">
        <button class="icon-btn" aria-label="Back" onClick={() => history.back()} style="margin-left:-12px">
          <ChevronLeft size={24} />
        </button>
        <h1 style="flex:1">Settings</h1>
      </header>

      <div class="section-title"><h2>Morning</h2></div>
      <Row label="Stories per section" value="3 · about 8–9 min" action="Change" />
      <Row label="Topics & sources" value="5 topics on" action="Edit" />
      <Row label="Past editions" value="Last 14 days" action="Open" />

      <BackupSection />

      <div class="section-title"><h2>To Do</h2></div>
      <Row label="Manage categories" value="6 categories" action="Edit" />

      <GrocerySection />

      <div class="section-title"><h2>About</h2></div>
      <Row label="Brooklyn Morning" value="Personal app · no tracking, no ads, no accounts" />
      <Row label="Licences" value="Fraunces & Inter (OFL), Lucide (ISC), Open Food Facts (ODbL / CC BY-SA)" action="View" />
    </main>
  );
}
