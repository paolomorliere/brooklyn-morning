import { useEffect, useState } from 'preact/hooks';

export type Route =
  | 'home'
  | 'todo'
  | 'groceries'
  | 'waterpolo'
  | 'team'
  | 'poll'
  | 'library'
  | 'settings'
  | 'quiz'
  | 'product';
const ROUTES: Route[] = ['home', 'todo', 'groceries', 'waterpolo', 'team', 'poll', 'library', 'settings', 'quiz', 'product'];

function read(): Route {
  const h = location.hash.replace(/^#\/?/, '').split('/')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
}

/** Path parameter after the route, e.g. #/product/00123 → '00123'. */
export function routeParam(): string | null {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return parts[1] ? decodeURIComponent(parts[1]) : null;
}

export function navigate(r: Route, param?: string) {
  const target = `/${r}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (location.hash !== `#${target}`) location.hash = target;
}

export function useRouteParam(): string | null {
  const [p, setP] = useState<string | null>(routeParam);
  useEffect(() => {
    const on = () => setP(routeParam());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return p;
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
