import { createBrowserRouter } from 'react-router';
import { AppShell, NAV } from './AppShell';
import { HomePage } from './HomePage';
import { NotBuiltPage } from './NotBuiltPage';
import { RouteError } from './RouteError';
import { StatusPage } from './StatusPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'status', element: <StatusPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/').map((n) => ({ path: n.to.slice(1), element: <NotBuiltPage /> })),
    ],
  },
]);
