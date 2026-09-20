import { useEffect, useState } from 'preact/hooks';

export type Route = 'home' | 'todo' | 'groceries' | 'library' | 'settings';
const ROUTES: Route[] = ['home', 'todo', 'groceries', 'library', 'settings'];

function read(): Route {
  const h = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'home';
}

export function navigate(r: Route) {
  if (read() !== r) location.hash = `/${r}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
