import { createPartySchema, updatePartySchema, type PartyDetail } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useServices } from '../../app/servicesContext';
import { Button, Card, DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useActiveBusinessId } from '../../store/activeBusinessStore';
import { useCustomerProfile } from './useCustomerDetail';

/**
 * Add or edit a customer (task 4 T3; ADR 0056): POST /v1/parties and PATCH /v1/parties/:id. The one question: who is
 * this customer and how do we reach them? The one action: save. A name and a mobile number are enough; the rest is
 * optional. The phone is checked with the shared rule (toE164) before anything is sent. A phone another customer
 * has is a 409 that names the matches and offers to save anyway (confirmDuplicate); a stale version says someone
 * else changed it.
 */
const input =
  'block min-h-11 w-full rounded-md border border-card-border bg-chip px-3 text-text focus:border-accent';

interface FormValues {
  name: string;
  nameBn: string;
  kind: 'person' | 'company';
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  area: string;
}

const EMPTY: FormValues = {
  name: '',
  nameBn: '',
  kind: 'person',
  phone: '',
  altPhone: '',
  email: '',
  address: '',
  area: '',
};

const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** The typed values as the API's fields, built once for both the check and the request. */
function fieldsOf(values: FormValues) {
  return {
    name: values.name.trim(),
    nameBn: blankToNull(values.nameBn),
    kind: values.kind,
    phone: values.phone.trim(),
    altPhone: blankToNull(values.altPhone),
    email: blankToNull(values.email),
    address: blankToNull(values.address),
    area: blankToNull(values.area),
  };
}

/** A new customer: a customer only, with the business defaults for credit (ADR 0056 section 3). */
const NEW_CUSTOMER = { isCustomer: true, isSupplier: false, creditLimit: null, payTermDays: null } as const;

function valuesOf(customer: PartyDetail): FormValues {
  return {
    name: customer.name,
    nameBn: customer.nameBn ?? '',
    kind: customer.kind,
    phone: customer.phone,
    altPhone: customer.altPhone ?? '',
    email: customer.email ?? '',
    address: customer.address ?? '',
    area: customer.area ?? '',
  };
}

/** The shared schema's verdict on one field, as a translated message the form shows under it. */
const FIELD_ERRORS: Partial<Record<keyof FormValues, MessageKey>> = {
  name: 'customerForm.error.name',
  phone: 'customerForm.error.phone',
  altPhone: 'customerForm.error.phone',
  email: 'customerForm.error.email',
};

/**
 * The same shared rules the API checks, run as the form's resolver: nothing is sent while a field would be refused,
 * and each refused field shows its translated message.
 */
function customerResolver(
  customer: PartyDetail | undefined,
  message: (key: MessageKey) => string,
): Resolver<FormValues> {
  return (values) => {
    const fields = fieldsOf(values);
    const result = customer
      ? updatePartySchema.safeParse({ ...fields, version: customer.version })
      : createPartySchema.safeParse({ ...fields, ...NEW_CUSTOMER });
    if (result.success) return { values, errors: {} };
    const errors: FieldErrors<FormValues> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      const key = FIELD_ERRORS[field];
      if (key && !errors[field]) errors[field] = { type: 'schema', message: message(key) };
    }
    return { values: {}, errors };
  };
}

type Refusal = { kind: 'duplicate'; matches: string[] } | { kind: MessageKey };

export function CustomerFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { t } = useI18n();
  const profile = useCustomerProfile(id);
  const loaded = !editing || profile.data !== undefined;

  return (
    <div className="mx-auto max-w-xl">
      <Link
        to={editing ? `/customers/${id}` : '/customers'}
        className="text-[13px] text-muted hover:text-accent-text"
      >
        ← {t('customers.title')}
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">
          {t(editing ? 'customerForm.editTitle' : 'customerForm.addTitle')}
        </h1>
        <DemoBadge service="party" />
      </div>
      <p className="mt-1 text-muted">{t('customerForm.subtitle')}</p>
      <Card className="mt-5 p-5">
        {loaded ? (
          <CustomerForm customer={editing ? profile.data : undefined} />
        ) : (
          <p className="text-muted">{t('customerForm.loading')}</p>
        )}
      </Card>
    </div>
  );
}

function CustomerForm({ customer }: { customer: PartyDetail | undefined }) {
  const { t } = useI18n();
  const { party } = useServices();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessId = useActiveBusinessId();
  const ids = {
    name: useId(),
    nameBn: useId(),
    phone: useId(),
    altPhone: useId(),
    email: useId(),
    address: useId(),
    area: useId(),
  };
  const form = useForm<FormValues>({
    defaultValues: customer ? valuesOf(customer) : EMPTY,
    resolver: customerResolver(customer, t),
  });
  const { register, handleSubmit, formState, reset } = form;
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  useEffect(() => {
    if (customer) reset(valuesOf(customer));
  }, [customer, reset]);

  const save = useMutation({
    mutationFn: ({ values, confirmDuplicate }: { values: FormValues; confirmDuplicate: boolean }) => {
      const fields = fieldsOf(values);
      return customer
        ? party.update(customer.id, { ...fields, version: customer.version, confirmDuplicate })
        : party.create({ ...fields, ...NEW_CUSTOMER, confirmDuplicate });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['parties', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['party', businessId, saved.id] });
      void navigate(`/customers/${saved.id}`);
    },
    onError: (error) => setRefusal(refusalOf(error)),
  });

  const submit = (confirmDuplicate: boolean) =>
    handleSubmit((values) => {
      setRefusal(null);
      save.mutate({ values, confirmDuplicate });
    });

  const field = (
    name: keyof FormValues,
    label: MessageKey,
    options: { optional?: boolean; hint?: MessageKey; type?: string } = {},
  ) => {
    const error = formState.errors[name]?.message;
    const hintId = `${ids[name as keyof typeof ids]}-hint`;
    return (
      <div className="space-y-1">
        <label htmlFor={ids[name as keyof typeof ids]} className="text-[13px] text-muted">
          {t(label)}
        </label>
        <input
          id={ids[name as keyof typeof ids]}
          type={options.type ?? 'text'}
          className={input}
          aria-invalid={Boolean(error)}
          aria-describedby={error || options.hint || options.optional ? hintId : undefined}
          {...register(name)}
        />
        {(error || options.hint || options.optional) && (
          <p id={hintId} className={error ? 'text-[13px] text-neg-text' : 'text-[13px] text-muted'}>
            {error ?? t(options.hint ?? 'customerForm.optional')}
          </p>
        )}
      </div>
    );
  };

  return (
    <form noValidate onSubmit={(e) => void submit(false)(e)} className="space-y-5">
      {field('name', 'customerForm.name')}
      {field('phone', 'customerForm.phone', { hint: 'customerForm.phone.hint', type: 'tel' })}
      <fieldset className="space-y-1">
        <legend className="text-[13px] text-muted">{t('customerForm.kind')}</legend>
        <div className="flex gap-4">
          {(['person', 'company'] as const).map((kind) => (
            <label key={kind} className="flex min-h-11 items-center gap-2">
              <input type="radio" value={kind} {...register('kind')} />
              {t(`customerForm.kind.${kind}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {field('area', 'customerForm.area', { optional: true })}
      {field('address', 'customerForm.address', { optional: true })}
      {field('nameBn', 'customerForm.nameBn', { optional: true })}
      {field('altPhone', 'customerForm.altPhone', { optional: true, type: 'tel' })}
      {field('email', 'customerForm.email', { optional: true, type: 'email' })}

      {refusal?.kind === 'duplicate' ? (
        <div role="alert" className="space-y-2 rounded-md border border-card-border p-3">
          <p className="font-medium">{t('customerForm.duplicate.title')}</p>
          <ul className="list-disc pl-5">
            {refusal.matches.map((match) => (
              <li key={match}>{match}</li>
            ))}
          </ul>
          <p className="text-[13px] text-muted">{t('customerForm.duplicate.hint')}</p>
          <Button disabled={save.isPending} onClick={() => void submit(true)()}>
            {t('customerForm.duplicate.saveAnyway')}
          </Button>
        </div>
      ) : (
        refusal && (
          <p role="alert" className="text-neg-text">
            {t(refusal.kind)}
          </p>
        )
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t(save.isPending ? 'customerForm.saving' : 'customerForm.save')}
        </Button>
        <Link
          to={customer ? `/customers/${customer.id}` : '/customers'}
          className="font-medium text-accent-text"
        >
          {t('customerForm.cancel')}
        </Link>
      </div>
    </form>
  );
}

/** The API's refusal, as what the form should say (ADR 0056 section 3: one field error per duplicate match). */
function refusalOf(error: unknown): Refusal {
  if (!(error instanceof ApiRequestError)) return { kind: 'customerForm.error.save' };
  const fields = error.body?.fields ?? [];
  const duplicates = fields.filter((f) => f.code === 'party.possible_duplicate').map((f) => f.message);
  if (duplicates.length > 0) return { kind: 'duplicate', matches: duplicates };
  if (fields.some((f) => f.code === 'party.version_conflict')) return { kind: 'customerForm.conflict' };
  if (error.status === 403) return { kind: 'customerForm.forbidden' };
  return { kind: 'customerForm.error.save' };
}
