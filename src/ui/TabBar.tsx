import { Newspaper, CheckSquare, ShoppingBasket, BookMarked } from 'lucide-preact';
import { navigate, type Route } from './router';

const TABS: { id: Route; label: string; Icon: typeof Newspaper }[] = [
  { id: 'home', label: 'Morning', Icon: Newspaper },
  { id: 'todo', label: 'To Do', Icon: CheckSquare },
  { id: 'groceries', label: 'Groceries', Icon: ShoppingBasket },
  { id: 'library', label: 'Library', Icon: BookMarked },
];

export function TabBar({ route }: { route: Route }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          class="tab"
          aria-current={route === id ? 'page' : undefined}
          onClick={() => navigate(id)}
        >
          <Icon strokeWidth={route === id ? 2.2 : 1.8} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
