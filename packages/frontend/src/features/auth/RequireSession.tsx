import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from '../../store/sessionStore';

/** Guards the signed-in part of the app: no session (or an expired one) goes to /login, then back. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
