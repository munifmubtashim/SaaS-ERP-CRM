import type { LoginRequest } from '@erp/shared';
import { useMutation } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import { sessionStore } from '../../store/sessionStore';

/** Signs in and stores the session. The component only renders the mutation's state. */
export function useLogin() {
  const { auth } = useServices();
  return useMutation({
    mutationFn: (request: LoginRequest) => auth.login(request),
    onSuccess: (session) => sessionStore.set(session),
  });
}

/** Signs out: tells the service, then forgets the session even if the call fails. */
export function useLogout() {
  const { auth } = useServices();
  return useMutation({
    mutationFn: () => auth.logout(),
    onSettled: () => sessionStore.clear(),
  });
}
