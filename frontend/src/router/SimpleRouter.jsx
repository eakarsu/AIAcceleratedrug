import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext({ pathname: '/', navigate: () => {} });

function normalizePath(path) {
  const value = String(path || '/').split(/[?#]/)[0] || '/';
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export function BrowserRouter({ children }) {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const value = useMemo(() => ({
    pathname,
    navigate(to, replace = false) {
      const target = normalizePath(to);
      if (target === pathname) return;
      window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
      setPathname(target);
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
  }), [pathname]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useLocation() {
  const { pathname } = useContext(RouterContext);
  return { pathname };
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function Link({ to, children, onClick, ...props }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Route() {
  return null;
}

export function Routes({ children }) {
  const { pathname } = useContext(RouterContext);
  const routes = React.Children.toArray(children).filter(Boolean);
  const exact = routes.find((route) => normalizePath(route.props.path) === pathname);
  const fallback = routes.find((route) => route.props.path === '*');
  return exact?.props.element || fallback?.props.element || null;
}

export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, replace);
  }, [navigate, replace, to]);
  return null;
}
