import {
  businessDateInDhaka,
  type FollowUpChannel,
  type FollowUpOutcome,
  type RecordFollowUp,
} from '@erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch, type FieldError } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useServices } from '../../app/servicesContext';
import { Button, Card } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import {
  EMPTY_FORM,
  FIELD_ORDER,
  followUpResolver,
  fromServerError,
  messageKeyFor,
  type FollowUpFormValues,
} from './followUpForm';

const CHANNELS: FollowUpChannel[] = ['call', 'visit', 'message'];
const OUTCOMES: FollowUpOutcome[] = ['promised', 'no_answer', 'refused', 'paid', 'other'];

const input =
  'min-h-11 w-full rounded-md border border-card-border bg-chip px-3 text-text aria-invalid:border-neg';
const chip =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-row-border px-4 text-text2 has-checked:border-accent has-checked:bg-accent-soft has-checked:font-semibold has-checked:text-accent-text has-focus-visible:outline-2 has-focus-visible:outline-accent';

/**
 * Record a follow-up (CR-05). Opened from a row of the follow-ups list, which passes the customer: the customer
 * is prefilled, not searched (a search waits for #33's party list). Next action: save, then back to the list.
 */
export function FollowUpFormPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const partyId = params.get('partyId');
  const partyName = (useLocation().state as { partyName?: unknown } | null)?.partyName;

  if (!partyId || typeof partyName !== 'string') {
    return (
      <>
        <h1 className="mb-4 text-2xl font-semibold">{t('followUps.form.title')}</h1>
        <Card className="max-w-xl space-y-4">
          <p className="text-muted">{t('followUps.form.noCustomer')}</p>
          <Link to="/follow-ups" className="font-medium text-accent-text">
            {t('followUps.form.backToList')}
          </Link>
        </Card>
      </>
    );
  }
  return <FollowUpForm partyId={partyId} partyName={partyName} />;
}

function FollowUpForm({ partyId, partyName }: { partyId: string; partyName: string }) {
  const { t } = useI18n();
  const { crm } = useServices();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<MessageKey | null>(null);
  const resolver = useMemo(() => followUpResolver(partyId), [partyId]);
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FollowUpFormValues, unknown, RecordFollowUp>({
    resolver,
    defaultValues: EMPTY_FORM,
    // Focus is ours: RHF would focus without scrolling the field into view on a long phone form.
    shouldFocusError: false,
  });

  /** Focuses the first invalid field on screen (the first choice of a radio group) and scrolls it into view. */
  const focusFirstInvalid = (names: readonly string[]) => {
    const first = FIELD_ORDER.find((name) => names.includes(name));
    const found = first ? formRef.current?.elements.namedItem(first) : null;
    const target = found instanceof RadioNodeList ? found[0] : found;
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center' });
  };
  // A banner (walk-in, unknown customer, permission) sits above every field, so it is first on screen: it takes focus.
  useEffect(() => {
    if (!banner) return;
    bannerRef.current?.focus({ preventScroll: true });
    bannerRef.current?.scrollIntoView({ block: 'center' });
  }, [banner]);

  // TEMPORARY stand-in list until A4's staff route.
  const collectors = useQuery({ queryKey: ['follow-up-collectors'], queryFn: () => crm.listCollectors() });

  const outcome = useWatch({ control, name: 'outcome' });
  const promised = outcome === 'promised';
  // A promise only belongs to "promised": switching away clears it, so the form never sends a stray promise.
  useEffect(() => {
    if (!promised) {
      setValue('promisedOn', '');
      setValue('amount', '');
    }
  }, [promised, setValue]);

  const save = useMutation({
    mutationFn: (followUp: RecordFollowUp) => crm.recordFollowUp(followUp),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['follow-ups'] });
      // A new promise is Open: the list opens there, so the saved follow-up is in view (not under Broken).
      const state = saved.promise ? { saved: true, promiseStatus: saved.promise.status } : { saved: true };
      await navigate('/follow-ups', { state });
    },
    onError: (error) => {
      const refusal = fromServerError(error);
      for (const field of refusal.fields) setError(field.name, { type: field.code, message: field.code });
      setBanner(refusal.banner);
      if (!refusal.banner) focusFirstInvalid(refusal.fields.map((f) => f.name));
    },
  });

  const message = (error: FieldError | undefined) =>
    error ? t(messageKeyFor(String(error.type))) : undefined;

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{t('followUps.form.title')}</h1>
      <Card className="max-w-xl">
        <form
          ref={formRef}
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            setBanner(null);
            void handleSubmit(
              (followUp) => save.mutate(followUp),
              (invalid) => focusFirstInvalid(Object.keys(invalid)),
            )(e);
          }}
        >
          {banner && (
            <p
              ref={bannerRef}
              role="alert"
              tabIndex={-1}
              className="rounded-md bg-neg-bg px-4 py-3 text-neg-text focus:outline-2 focus:outline-neg-text"
            >
              {t(banner)}
            </p>
          )}

          <div>
            <p className="text-[13px] text-muted">{t('followUps.form.customer')}</p>
            <p className="font-medium">{partyName}</p>
          </div>

          <Field id="collectorId" label={t('followUps.form.collector')} error={message(errors.collectorId)}>
            {collectors.isError ? (
              <p className="text-muted">{t('followUps.form.collectorsError')}</p>
            ) : (
              <select
                id="collectorId"
                className={input}
                aria-invalid={!!errors.collectorId}
                aria-describedby={errors.collectorId ? 'collectorId-error' : undefined}
                disabled={collectors.isPending}
                {...register('collectorId')}
              >
                <option value="">{t('followUps.form.collectorPlaceholder')}</option>
                {collectors.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Choice legend={t('followUps.form.channel')} error={message(errors.channel)} name="channel">
            {CHANNELS.map((c) => (
              <label key={c} className={chip}>
                <input type="radio" value={c} className="sr-only" {...register('channel')} />
                {t(`followUps.channel.${c}`)}
              </label>
            ))}
          </Choice>

          <Choice legend={t('followUps.form.outcome')} error={message(errors.outcome)} name="outcome">
            {OUTCOMES.map((o) => (
              <label key={o} className={chip}>
                <input type="radio" value={o} className="sr-only" {...register('outcome')} />
                {t(`followUps.outcome.${o}`)}
              </label>
            ))}
          </Choice>

          {promised && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="promisedOn"
                label={t('followUps.form.promisedOn')}
                error={message(errors.promisedOn)}
              >
                <input
                  id="promisedOn"
                  type="date"
                  // The server decides (#137); this only stops picking a past day.
                  min={businessDateInDhaka(new Date())}
                  className={`${input} num`}
                  aria-invalid={!!errors.promisedOn}
                  aria-describedby={errors.promisedOn ? 'promisedOn-error' : undefined}
                  {...register('promisedOn')}
                />
              </Field>
              <Field
                id="amount"
                label={t('followUps.form.amount')}
                hint={t('followUps.form.amountHint')}
                error={message(errors.amount)}
              >
                <input
                  id="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${input} num text-right`}
                  aria-invalid={!!errors.amount}
                  aria-describedby={errors.amount ? 'amount-error' : 'amount-hint'}
                  {...register('amount')}
                />
              </Field>
            </div>
          )}

          <Field id="note" label={t('followUps.form.note')} error={message(errors.note)}>
            <textarea id="note" rows={3} maxLength={500} className={`${input} py-2`} {...register('note')} />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? t('followUps.form.saving') : t('followUps.form.save')}
            </Button>
            <Link
              to="/follow-ups"
              className="inline-flex min-h-11 items-center rounded-md px-4 font-semibold text-text2"
            >
              {t('followUps.form.cancel')}
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}

function Field(props: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.id} className="block text-[13px] font-medium text-text2">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && (
        <p id={`${props.id}-hint`} className="text-[13px] text-muted">
          {props.hint}
        </p>
      )}
      {props.error && (
        <p id={`${props.id}-error`} className="text-[13px] text-neg-text">
          {props.error}
        </p>
      )}
    </div>
  );
}

function Choice(props: { legend: string; name: string; error?: string; children: ReactNode }) {
  return (
    <fieldset aria-describedby={props.error ? `${props.name}-error` : undefined}>
      <legend className="mb-1 text-[13px] font-medium text-text2">{props.legend}</legend>
      <div className="flex flex-wrap gap-2">{props.children}</div>
      {props.error && (
        <p id={`${props.name}-error`} className="mt-1 text-[13px] text-neg-text">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}
