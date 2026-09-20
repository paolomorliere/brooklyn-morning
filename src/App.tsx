import { useRoute } from '@/ui/router';
import { TabBar } from '@/ui/TabBar';
import { ToastProvider } from '@/ui/Toast';
import { BackupBanner } from '@/ui/BackupBanner';
import { Home } from '@/screens/Home';
import { Todo } from '@/screens/Todo';
import { Groceries } from '@/screens/Groceries';
import { Library } from '@/screens/Library';
import { Settings } from '@/screens/Settings';
import { seedFixtures } from '../fixtures/seed';

// ?fixtures=1 on localhost seeds the personal database with sample data for screenshots and tests.
const params = new URLSearchParams(location.search);
const fixtures = params.get('fixtures') === '1' && ['localhost', '127.0.0.1'].includes(location.hostname);
if (fixtures) void seedFixtures(params.get('seed') ?? 'all');

export function App() {
  const route = useRoute();
  return (
    <ToastProvider>
      <div class="app">
        {route !== 'settings' && <BackupBanner />}
        {route === 'home' && <Home />}
        {route === 'todo' && <Todo />}
        {route === 'groceries' && <Groceries />}
        {route === 'library' && <Library />}
        {route === 'settings' && <Settings />}
        {route !== 'settings' && <TabBar route={route} />}
      </div>
    </ToastProvider>
  );
}
