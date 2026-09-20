import { useRoute } from '@/ui/router';
import { TabBar } from '@/ui/TabBar';
import { ToastProvider } from '@/ui/Toast';
import { Home } from '@/screens/Home';
import { Todo } from '@/screens/Todo';
import { Groceries } from '@/screens/Groceries';
import { Library } from '@/screens/Library';
import { Settings } from '@/screens/Settings';
import * as fx from '../fixtures/preview';

// Phase 1: screens are driven by preview fixtures. Phase 2+ replaces these with IndexedDB stores.
const params = new URLSearchParams(location.search);
const fixtures = params.get('fixtures') === '1' && ['localhost', '127.0.0.1'].includes(location.hostname);
const gstate = params.get('gstate'); // preview: first | list | suggest

export function App() {
  const route = useRoute();
  return (
    <ToastProvider>
      <div class="app">
        {route === 'home' && (
          <Home
            edition={fixtures ? fx.previewEdition : null}
            lesson={fixtures ? fx.previewLesson : null}
            lessonDayIndex={0}
            readDays={[false, false, false, false, false, false, false]}
            storiesPerSection={3}
          />
        )}
        {route === 'todo' && <Todo categories={fx.previewCategories} tasks={fixtures ? fx.previewTasks : []} />}
        {route === 'groceries' && (
          <Groceries
            list={fixtures && gstate !== 'first' && gstate !== 'suggest' ? fx.previewList : []}
            history={fixtures && gstate !== 'first' ? fx.previewHistory : []}
            buyAgain={fx.previewProducts.slice(0, 6)}
            discover={fx.previewDiscover}
          />
        )}
        {route === 'library' && <Library entries={fixtures ? fx.previewLibrary : []} />}
        {route === 'settings' && <Settings />}
        {route !== 'settings' && <TabBar route={route} />}
      </div>
    </ToastProvider>
  );
}
