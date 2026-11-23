import { createBrowserRouter } from 'react-router';
import { FollowUpFormPage, FollowUpListPage } from '../features/crm';
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
      // Not in the navigation yet: the menu is the approved design's (shared), so adding it is a separate PR.
      { path: 'follow-ups', element: <FollowUpListPage /> },
      { path: 'follow-ups/new', element: <FollowUpFormPage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/').map((n) => ({ path: n.to.slice(1), element: <NotBuiltPage /> })),
    ],
  },
]);
