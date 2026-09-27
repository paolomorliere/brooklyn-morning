import { useEffect, useState } from 'preact/hooks';
import { useRoute } from '@/ui/router';
import { TabBar } from '@/ui/TabBar';
import { ToastProvider } from '@/ui/Toast';
import { BackupBanner } from '@/ui/BackupBanner';
import { Home } from '@/screens/Home';
import { Todo } from '@/screens/Todo';
import { Groceries } from '@/screens/Groceries';
import { WaterPolo } from '@/screens/WaterPolo';
import { TeamDetail } from '@/screens/TeamDetail';
import { Poll } from '@/screens/Poll';
import { Library } from '@/screens/Library';
import { Settings } from '@/screens/Settings';
import { Quiz } from '@/screens/Quiz';
import { WeekReview } from '@/screens/WeekReview';
import { Reader } from '@/screens/Reader';
import { ProductDetail } from '@/screens/ProductDetail';
import { seedFixtures } from '../fixtures/seed';

// ?fixtures=1 on localhost seeds the personal database with sample data for screenshots and tests.
const params = new URLSearchParams(location.search);
const fixtures = params.get('fixtures') === '1' && ['localhost', '127.0.0.1'].includes(location.hostname);
// The seed must finish before the stores read, or a seeded profile would be overwritten by the
// defaults the app creates on a first run.
const seeded = fixtures ? seedFixtures(params.get('seed') ?? 'all') : Promise.resolve();

export function App() {
  const route = useRoute();
  const [ready, setReady] = useState(!fixtures);
  useEffect(() => { void seeded.then(() => setReady(true)); }, []);
  if (!ready) return null;
  return (
    <ToastProvider>
      <div class="app">
        {route !== 'settings' && <BackupBanner />}
        {route === 'home' && <Home />}
        {route === 'todo' && <Todo />}
        {route === 'groceries' && <Groceries />}
        {route === 'waterpolo' && <WaterPolo />}
        {route === 'team' && <TeamDetail />}
        {route === 'poll' && <Poll />}
        {route === 'library' && <Library />}
        {route === 'settings' && <Settings />}
        {route === 'quiz' && <Quiz />}
        {route === 'week' && <WeekReview />}
        {route === 'read' && <Reader />}
        {route === 'product' && <ProductDetail />}
        {!['settings', 'quiz', 'week', 'read', 'product', 'team', 'poll'].includes(route) && <TabBar route={route} />}
      </div>
    </ToastProvider>
  );
}
