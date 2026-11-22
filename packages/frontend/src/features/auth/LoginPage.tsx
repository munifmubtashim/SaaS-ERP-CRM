import { loginRequestSchema } from '@erp/shared';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { LanguageSwitch } from '../../app/AppShell';
import { Button, Card } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useSession } from '../../store/sessionStore';
import { normalizeLogin } from './normalizeLogin';
import { useLogin } from './useLogin';

interface LoginForm {
  login: string;
  password: string;
}

const field =
  'mt-1 block min-h-11 w-full rounded-md border border-card-border bg-chip px-3 text-text aria-invalid:border-neg-text';

/** Answers "who are you?"; the one action is Sign in. */
export function LoginPage() {
  const { t } = useI18n();
  const session = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const login = useLogin();
  const { register, handleSubmit, setError, formState } = useForm<LoginForm>();
  const { errors } = formState;

  if (session) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit((values) => {
    const parsed = loginRequestSchema.safeParse({ ...values, login: normalizeLogin(values.login) });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = issue.path[0];
        if (name === 'login') setError('login', { message: t('login.error.login') });
        if (name === 'password') setError('password', { message: t('login.error.password') });
      }
      return;
    }
    login.mutate(parsed.data, { onSuccess: () => void navigate(from, { replace: true }) });
  });

  const failure = login.error
    ? login.error instanceof ApiRequestError && login.error.status === 401
      ? t('login.error.wrong')
      : login.error instanceof ApiRequestError && login.error.status === 429
        ? t('login.error.tooMany')
        : t('login.error.unavailable')
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <LanguageSwitch />
      <Card className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
          <p className="text-muted">{t('login.subtitle')}</p>
        </div>
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4" aria-busy={login.isPending}>
          <label className="block font-medium">
            {t('login.field.login')}
            <input
              {...register('login')}
              className={field}
              autoComplete="username"
              inputMode="email"
              aria-invalid={errors.login ? true : undefined}
            />
            {errors.login && (
              <span className="mt-1 block text-[13px] text-neg-text">{errors.login.message}</span>
            )}
          </label>
          <label className="block font-medium">
            {t('login.field.password')}
            <input
              {...register('password')}
              type="password"
              className={field}
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
            />
            {errors.password && (
              <span className="mt-1 block text-[13px] text-neg-text">{errors.password.message}</span>
            )}
          </label>
          {failure && (
            <p role="alert" className="rounded-md bg-neg-bg px-3 py-2 text-neg-text">
              {failure}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={login.isPending}>
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Card>
    </main>
  );
}
