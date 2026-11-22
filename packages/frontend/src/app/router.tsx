import { createBrowserRouter } from 'react-router';
import { CustomerDetailPage, CustomerListPage } from '../features/party';
import { RecordPaymentPage } from '../features/sales';
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
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'customers/:id/payment', element: <RecordPaymentPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/' && n.to !== '/customers').map((n) => ({
        path: n.to.slice(1),
        element: <NotBuiltPage />,
      })),
    ],
  },
]);
