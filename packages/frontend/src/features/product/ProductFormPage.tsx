import {
  moneyFromTyped,
  productCreateSchema,
  productEditSchema,
  type ProductDetail,
  type ProductStatus,
} from '@erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useServices } from '../../app/servicesContext';
import { Button, Card, DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useActiveBusinessId } from '../../store/activeBusinessStore';

/**
 * Add, edit or archive a product (task 5; ADR 0052): POST /v1/products and PATCH /v1/products/:id. The one question:
 * what do we sell, and at what price? The one action: save. Code and tracking are fixed once the product exists
 * (#105), so the edit form shows them as text. Archiving is a PATCH with status "archived" after a confirm step that
 * names the product; a product is never deleted. Only the owner and a business manager may write (#131): a 403 says so.
 */
const input =
  'block min-h-11 w-full rounded-md border border-card-border bg-chip px-3 text-text focus:border-accent';

interface FormValues {
  code: string;
  name: string;
  nameBn: string;
  brand: string;
  category: string;
  unit: string;
  tracking: '' | 'serial' | 'quantity';
  sellPrice: string;
}

type TextField = Exclude<keyof FormValues, 'tracking'>;

const EMPTY: FormValues = {
  code: '',
  name: '',
  nameBn: '',
  brand: '',
  category: '',
  unit: '',
  tracking: '',
  sellPrice: '',
};

const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim());

function valuesOf(product: ProductDetail): FormValues {
  return {
    code: product.code,
    name: product.name,
    nameBn: product.nameBn ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    unit: product.unit,
    tracking: product.tracking,
    sellPrice: product.sellPrice,
  };
}

/** The fields an edit may change: everything but code and tracking. */
function editableOf(values: FormValues) {
  return {
    name: values.name.trim(),
    nameBn: blankToNull(values.nameBn),
    brand: blankToNull(values.brand),
    category: blankToNull(values.category),
    unit: values.unit.trim(),
    sellPrice: moneyFromTyped(values.sellPrice),
  };
}

/** The request body: a new product carries its code and tracking; an edit carries the version read. */
function bodyOf(values: FormValues, product: ProductDetail | undefined) {
  return product
    ? { version: product.version, ...editableOf(values) }
    : { code: values.code.trim(), tracking: values.tracking, ...editableOf(values) };
}

const FIELD_ERRORS: Partial<Record<keyof FormValues, MessageKey>> = {
  code: 'productForm.error.code',
  name: 'productForm.error.name',
  unit: 'productForm.error.unit',
  tracking: 'productForm.error.tracking',
  sellPrice: 'productForm.error.sellPrice',
};

/** The shared schema the API checks, as the form's resolver: nothing is sent while a field would be refused. */
function productResolver(
  product: ProductDetail | undefined,
  message: (key: MessageKey) => string,
): Resolver<FormValues> {
  return (values) => {
    const body = bodyOf(values, product);
    const result = product ? productEditSchema.safeParse(body) : productCreateSchema.safeParse(body);
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

/** A used code is shown on the code field; every other refusal is one message under the form. */
type Refusal = 'codeTaken' | MessageKey;

/** The API's refusal, as what the form should say. */
function refusalOf(error: unknown): Refusal {
  if (!(error instanceof ApiRequestError)) return 'productForm.error.save';
  const codes = (error.body?.fields ?? []).map((f) => f.code);
  if (codes.includes('product.code_taken')) return 'codeTaken';
  if (codes.includes('product.version_conflict')) return 'productForm.conflict';
  if (error.status === 403) return 'productForm.forbidden';
  return 'productForm.error.save';
}

export function ProductFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { t } = useI18n();
  const { product: products } = useServices();
  const businessId = useActiveBusinessId();
  const product = useQuery({
    queryKey: ['product', businessId, id],
    queryFn: () => products.get(id ?? ''),
    // The add form reads nothing.
    enabled: editing,
  });

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/products" className="text-[13px] text-muted hover:text-accent-text">
        ← {t('shell.nav.products')}
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold">
          {t(editing ? 'productForm.editTitle' : 'productForm.addTitle')}
        </h1>
        <DemoBadge service="product.catalogue" />
      </div>
      <p className="mt-1 text-muted">{t('productForm.subtitle')}</p>
      <Card className="mt-5 p-5">
        {!editing ? (
          <ProductForm product={undefined} />
        ) : product.isError ? (
          <p role="alert" className="text-neg-text">
            {t('productForm.loadError')}
          </p>
        ) : product.data ? (
          <ProductForm product={product.data} />
        ) : (
          <p role="status" className="text-muted">
            {t('productForm.loading')}
          </p>
        )}
      </Card>
    </div>
  );
}

function ProductForm({ product }: { product: ProductDetail | undefined }) {
  const { t } = useI18n();
  const { product: products } = useServices();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessId = useActiveBusinessId();
  const ids = {
    code: useId(),
    name: useId(),
    nameBn: useId(),
    brand: useId(),
    category: useId(),
    unit: useId(),
    sellPrice: useId(),
  };
  const { register, handleSubmit, setError, formState, reset } = useForm<FormValues>({
    defaultValues: product ? valuesOf(product) : EMPTY,
    resolver: productResolver(product, t),
  });
  const [refusal, setRefusal] = useState<MessageKey | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (product) reset(valuesOf(product));
  }, [product, reset]);

  const done = (saved: ProductDetail) => {
    void queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    void queryClient.invalidateQueries({ queryKey: ['product', businessId, saved.id] });
    void navigate('/products');
  };
  const failed = (error: unknown) => {
    const why = refusalOf(error);
    if (why === 'codeTaken') setError('code', { message: t('productForm.error.codeTaken') });
    else setRefusal(why);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = bodyOf(values, product);
      return product
        ? products.edit(product.id, productEditSchema.parse(body))
        : products.create(productCreateSchema.parse(body));
    },
    onSuccess: done,
    onError: failed,
  });

  const setStatus = useMutation({
    mutationFn: ({ target, status }: { target: ProductDetail; status: ProductStatus }) =>
      products.edit(target.id, { version: target.version, status }),
    onSuccess: done,
    onError: failed,
  });

  const busy = save.isPending || setStatus.isPending;

  const field = (
    name: TextField,
    label: MessageKey,
    options: { optional?: boolean; hint?: MessageKey } = {},
  ) => {
    const error = formState.errors[name]?.message;
    const hintId = `${ids[name]}-hint`;
    const note =
      error ?? (options.hint ? t(options.hint) : options.optional ? t('productForm.optional') : null);
    return (
      <div className="space-y-1">
        <label htmlFor={ids[name]} className="text-[13px] text-muted">
          {t(label)}
        </label>
        <input
          id={ids[name]}
          type="text"
          inputMode={name === 'sellPrice' ? 'decimal' : undefined}
          className={name === 'sellPrice' ? `${input} num` : input}
          aria-invalid={Boolean(error)}
          aria-describedby={note ? hintId : undefined}
          {...register(name)}
        />
        {note && (
          <p id={hintId} className={error ? 'text-[13px] text-neg-text' : 'text-[13px] text-muted'}>
            {note}
          </p>
        )}
      </div>
    );
  };

  const trackingError = formState.errors.tracking?.message;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        setRefusal(null);
        void handleSubmit((values) => save.mutate(values))(e);
      }}
      className="space-y-5"
    >
      {product ? (
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-chip p-3 text-[13px]">
          <div>
            <dt className="text-muted">{t('productForm.code')}</dt>
            <dd className="num font-semibold">{product.code}</dd>
          </div>
          <div>
            <dt className="text-muted">{t('productForm.tracking')}</dt>
            <dd className="font-semibold">{t(`prod.tracking.${product.tracking}`)}</dd>
          </div>
          <p className="col-span-2 text-muted">{t('productForm.fixed')}</p>
          {product.status === 'archived' && (
            <p className="col-span-2 font-semibold text-warn-text">{t('productForm.archived')}</p>
          )}
        </dl>
      ) : (
        <>
          {field('code', 'productForm.code', { hint: 'productForm.code.hint' })}
          <fieldset
            className="space-y-1"
            aria-describedby={trackingError ? `${ids.code}-tracking` : undefined}
          >
            <legend className="text-[13px] text-muted">{t('productForm.tracking')}</legend>
            <div className="flex flex-wrap gap-4">
              {(['serial', 'quantity'] as const).map((tracking) => (
                <label key={tracking} className="flex min-h-11 items-center gap-2">
                  <input type="radio" value={tracking} {...register('tracking')} />
                  {t(`prod.tracking.${tracking}`)}
                </label>
              ))}
            </div>
            <p
              id={`${ids.code}-tracking`}
              className={trackingError ? 'text-[13px] text-neg-text' : 'text-[13px] text-muted'}
            >
              {trackingError ?? t('productForm.fixed')}
            </p>
          </fieldset>
        </>
      )}
      {field('name', 'productForm.name')}
      {field('sellPrice', 'productForm.sellPrice', { hint: 'productForm.sellPrice.hint' })}
      {field('unit', 'productForm.unit', { hint: 'productForm.unit.hint' })}
      {field('category', 'productForm.category', { optional: true })}
      {field('brand', 'productForm.brand', { optional: true })}
      {field('nameBn', 'productForm.nameBn', { optional: true })}

      {refusal && (
        <p role="alert" className="text-neg-text">
          {t(refusal)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {t(save.isPending ? 'productForm.saving' : 'productForm.save')}
        </Button>
        <Link to="/products" className="font-medium text-accent-text">
          {t('productForm.cancel')}
        </Link>
        {product?.status === 'active' && !confirming && (
          <Button className="ml-auto" disabled={busy} onClick={() => setConfirming(true)}>
            {t('productForm.archive')}
          </Button>
        )}
        {product?.status === 'archived' && (
          <Button
            className="ml-auto"
            disabled={busy}
            onClick={() => {
              setRefusal(null);
              setStatus.mutate({ target: product, status: 'active' });
            }}
          >
            {t('productForm.restore')}
          </Button>
        )}
      </div>

      {product && confirming && (
        <div
          role="alertdialog"
          aria-labelledby={`${ids.name}-archive`}
          className="space-y-3 rounded-md border border-card-border p-3"
        >
          <p id={`${ids.name}-archive`}>{t('productForm.archive.confirm', { name: product.name })}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() => {
                setRefusal(null);
                setStatus.mutate({ target: product, status: 'archived' });
              }}
            >
              {t('productForm.archive.yes', { name: product.name })}
            </Button>
            <Button disabled={busy} onClick={() => setConfirming(false)}>
              {t('productForm.archive.no')}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
