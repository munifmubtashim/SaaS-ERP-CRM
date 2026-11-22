import { createBrowserRouter } from 'react-router';
import { CustomerListPage } from '../features/party';
import { AppShell, NAV } from './AppShell';
import { HomePage } from './HomePage';
import { NotBuiltPage } from './NotBuiltPage';
import { RouteError } from './RouteError';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'customers', element: <CustomerListPage /> },
      // The profile screen comes in F1b-2; until then a customer link opens the placeholder.
      { path: 'customers/:id', element: <NotBuiltPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/' && n.to !== '/customers').map((n) => ({
        path: n.to.slice(1),
        element: <NotBuiltPage />,
      })),
    ],
  },
]);
