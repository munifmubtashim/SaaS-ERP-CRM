import type { IPaymentMethodRule } from './contracts/IPaymentMethodRule.js';

/** The release 1 payment methods (ADR 0016 section 3), registered in one list by the composition root. */
export class CashPayment implements IPaymentMethodRule {
  readonly method = 'cash';
  readonly debitRole = 'cash';
  readonly needsExternalRef = false;
}

export class BankPayment implements IPaymentMethodRule {
  readonly method = 'bank';
  readonly debitRole = 'bank';
  readonly needsExternalRef = true;
}

export class BkashPayment implements IPaymentMethodRule {
  readonly method = 'bkash';
  readonly debitRole = 'mobile_money';
  readonly needsExternalRef = true;
}

export class CardPayment implements IPaymentMethodRule {
  readonly method = 'card';
  readonly debitRole = 'card_clearing';
  readonly needsExternalRef = true;
}
