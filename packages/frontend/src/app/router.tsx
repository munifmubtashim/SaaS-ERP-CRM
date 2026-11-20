import { createBrowserRouter } from 'react-router';
import { ProductListPage } from '../features/product';
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
      { path: 'inventory/products', element: <ProductListPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/').map((n) => ({ path: n.to.slice(1), element: <NotBuiltPage /> })),
    ],
  },
]);
