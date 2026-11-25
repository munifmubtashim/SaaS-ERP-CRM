import { formatDateBD, isZero, parseMoney, type CustomerDues, type PartyDetail } from '@erp/shared';
import { useId, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, DemoBadge } from '../../components/ui';
import { useI18n, useTaka } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useActiveBusinessId } from '../../store/activeBusinessStore';
import { useCustomerDues, useCustomerProfile } from './useCustomerDetail';

/**
 * An invoice amount: a "label ... amount" line in the narrow layout (label from data-label, muted), a
 * right-aligned table cell in the wide one.
 */
const amountCell =
  'num col-span-2 flex justify-between gap-3 whitespace-nowrap before:font-normal before:text-muted ' +
  'before:content-[attr(data-label)] @xl:table-cell @xl:py-3 @xl:text-right @xl:before:content-none';

const actionLink =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 font-semibold text-on-accent hover:brightness-110';
const quietLink =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-card-border bg-chip px-4 font-semibold text-text hover:border-accent';

/**
 * Customer profile: what does this customer owe, and how do I reach them? Next action: record a payment.
 * Keyed by the active business, so a switch starts fresh and a customer of another business is "not found"
 * (ADR 0007).
 */
export function CustomerDetailPage() {
  const businessId = useActiveBusinessId();
  const { id = '' } = useParams();
  return <CustomerDetail key={`${businessId}:${id}`} id={id} />;
}

function CustomerDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const profile = useCustomerProfile(id);

  if (profile.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('customer.loading')}
      </p>
    );
  }

  if (profile.isError) {
    const status = profile.error instanceof ApiRequestError ? profile.error.status : undefined;
    if (status === 404) {
      return (
        <div className="space-y-4">
          <p>{t('customer.notFound')}</p>
          <Link to="/customers" className="font-medium text-accent-text">
            {t('customer.back')}
          </Link>
        </div>
      );
    }
    if (status === 403) return <p className="text-muted">{t('customer.forbidden')}</p>;
    return (
      <div role="alert" className="space-y-4">
        <p>{t('customer.error')}</p>
        <Button onClick={() => void profile.refetch()}>{t('customer.retry')}</Button>
      </div>
    );
  }

  const customer = profile.data;
  return (
    <>
      <Link to="/customers" className="text-[13px] text-muted hover:text-accent-text">
        ← {t('customer.back')}
      </Link>
      <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <DemoBadge service="party" />
          </div>
          {customer.nameBn && (
            <p lang="bn" className="text-text2">
              {customer.nameBn}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="num text-muted">{customer.code}</span>
            {customer.status === 'inactive' && (
              <span className="rounded-full bg-chip px-2 py-0.5 text-muted">
                {t('customers.status.inactive')}
              </span>
            )}
            {customer.onCreditHold && (
              <span className="rounded-full bg-warn-bg px-2 py-0.5 font-semibold text-warn-text">
                {t('customer.creditHold')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 self-start">
          <Link to={`/customers/${customer.id}/edit`} className={quietLink}>
            {t('customer.edit')}
          </Link>
          <Link to={`/customers/${customer.id}/payment`} className={actionLink}>
            {t('customer.recordPayment')}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="min-w-0 md:col-span-2">
          <DuesSection id={customer.id} />
        </Card>
        <Card className="min-w-0">
          <ProfileFacts customer={customer} />
        </Card>
      </div>
    </>
  );
}

function DuesSection({ id }: { id: string }) {
  const { t } = useI18n();
  const dues = useCustomerDues(id);

  if (dues.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('customer.dues.loading')}
      </p>
    );
  }
  if (dues.isError) {
    return (
      <div role="alert" className="space-y-4">
        <p>{t('customer.dues.error')}</p>
        <Button onClick={() => void dues.refetch()}>{t('customer.retry')}</Button>
      </div>
    );
  }
  return <Dues dues={dues.data} />;
}

function Dues({ dues }: { dues: CustomerDues }) {
  const { t } = useI18n();
  const taka = useTaka();
  const totalId = useId();
  const advanceId = useId();
  const owesNothing = dues.openInvoices.length === 0;

  return (
    <>
      <div className="flex items-center gap-2">
        <p id={totalId} className="text-[13px] text-muted">
          {t('customer.dues.total')}
        </p>
        <DemoBadge service="party.dues" compact />
      </div>
      <p aria-labelledby={totalId} className="num text-[32px] font-semibold leading-tight">
        {taka(dues.totalDue)}
      </p>
      {!isZero(parseMoney(dues.advance)) && (
        <p className="mt-1 text-[13px] text-text2">
          <span id={advanceId}>{t('customer.dues.advance')}</span>{' '}
          <span aria-labelledby={advanceId} className="num">
            {taka(dues.advance)}
          </span>
        </p>
      )}

      {owesNothing ? (
        <p className="mt-6 text-muted">{t('customer.dues.none')}</p>
      ) : (
        <>
          <h2 className="mt-6 mb-2 text-[13px] font-medium text-muted">{t('customer.dues.openInvoices')}</h2>
          {/*
            One table, two layouts, chosen by the card's own width (container query), not the screen's.
            Narrow (a phone, or the card beside the facts on a tablet): each invoice stacks as a small block,
            number and date on top, then Total, Paid and Due as label and amount lines, so Due is never
            scrolled out of view, even for a 9-digit amount. The labels come from data-label through CSS,
            so they stay out of the cell text. Wide (36rem and up): the usual five-column table.
          */}
          <div className="@container">
            <table className="block w-full text-left @xl:table">
              <thead className="sr-only text-[13px] text-muted @xl:not-sr-only @xl:table-header-group">
                <tr className="border-b border-row-border">
                  <th className="py-2 pr-4 font-medium">{t('customer.col.invoice')}</th>
                  <th className="py-2 pr-4 font-medium">{t('customer.col.date')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t('customer.col.total')}</th>
                  <th className="py-2 pr-4 text-right font-medium">{t('customer.col.paid')}</th>
                  <th className="py-2 text-right font-medium">{t('customer.col.due')}</th>
                </tr>
              </thead>
              <tbody className="block @xl:table-row-group">
                {dues.openInvoices.map((inv) => (
                  <tr
                    key={inv.invoiceId}
                    className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-row-border py-3 @xl:table-row @xl:py-0"
                  >
                    <td className="num font-medium @xl:py-3 @xl:pr-4 @xl:font-normal">{inv.invoiceNumber}</td>
                    <td className="num text-right text-text2 @xl:py-3 @xl:pr-4 @xl:text-left">
                      {formatDateBD(inv.invoiceDate)}
                    </td>
                    <td data-label={t('customer.col.total')} className={`${amountCell} @xl:pr-4`}>
                      {taka(inv.total)}
                    </td>
                    <td data-label={t('customer.col.paid')} className={`${amountCell} text-text2 @xl:pr-4`}>
                      {taka(inv.paid)}
                    </td>
                    <td data-label={t('customer.col.due')} className={`${amountCell} font-semibold`}>
                      {taka(inv.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function ProfileFacts({ customer }: { customer: PartyDetail }) {
  const { t } = useI18n();
  const taka = useTaka();
  const address = [customer.address, customer.area].filter(Boolean).join(', ') || '—';

  return (
    <>
      <h2 className="mb-3 text-[13px] font-medium text-muted">{t('customer.details')}</h2>
      <dl className="space-y-3">
        <Fact label={t('customer.phone')}>
          <span className="num">{customer.phone}</span>
        </Fact>
        {customer.altPhone && (
          <Fact label={t('customer.altPhone')}>
            <span className="num">{customer.altPhone}</span>
          </Fact>
        )}
        <Fact label={t('customer.address')}>{address}</Fact>
        <Fact label={t('customer.nid')}>
          {customer.nidLast4 ? (
            <span className="num">•••• {customer.nidLast4}</span>
          ) : (
            <span className="text-muted">{t('customer.nid.none')}</span>
          )}
        </Fact>
        <Fact label={t('customer.creditLimit')}>
          {customer.creditLimit ? (
            <span className="num">{taka(customer.creditLimit)}</span>
          ) : (
            t('customer.creditLimit.none')
          )}
        </Fact>
        <Fact label={t('customer.payTerms')}>
          {customer.payTermDays === null
            ? t('customer.payTerms.default')
            : t('customer.payTerms.days').replace('{days}', String(customer.payTermDays))}
        </Fact>
      </dl>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
