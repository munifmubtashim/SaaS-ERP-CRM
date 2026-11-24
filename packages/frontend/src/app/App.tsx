import { RouterProvider } from 'react-router';
import type { Services } from '../services';
import { Providers } from './providers';
import { router } from './router';

export function App({ services }: { services: Services }) {
  return (
    <Providers services={services}>
      <RouterProvider router={router} />
    </Providers>
  );
}
