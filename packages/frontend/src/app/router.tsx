import { createBrowserRouter } from 'react-router';
import { StockPage } from '../features/inventory';
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
      { path: 'inventory', element: <StockPage /> },
      { path: 'inventory/products', element: <ProductListPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/' && n.to !== '/inventory').map((n) => ({
        path: n.to.slice(1),
        element: <NotBuiltPage />,
      })),
    ],
  },
]);
