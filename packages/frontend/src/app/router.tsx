import { createBrowserRouter } from 'react-router';
import { LoginPage, RequireSession } from '../features/auth';
import { CustomerDetailPage, CustomerListPage } from '../features/party';
import { RecordPaymentPage } from '../features/sales';
import { AppShell, NAV } from './AppShell';
import { DashboardPage } from '../features/report';
import { InventoryPage } from '../features/inventory';
import { PosPage } from '../features/sales';
import { VehicleProductsPage } from '../features/vehicle';
import { NotBuiltPage } from './NotBuiltPage';
import { RouteError } from './RouteError';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'customers', element: <CustomerListPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'customers/:id/payment', element: <RecordPaymentPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/' && n.to !== '/customers').map((n) => ({
        path: n.to.slice(1),
        element:
          n.to === '/sales' ? (
            <PosPage />
          ) : n.to === '/inventory' ? (
            <InventoryPage />
          ) : n.to === '/products' ? (
            <VehicleProductsPage />
          ) : (
            <NotBuiltPage />
          ),
      })),
    ],
  },
]);
