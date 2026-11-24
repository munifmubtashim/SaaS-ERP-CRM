import type { AccountRole } from './provided/IPostingService.js';

/** One payment method (ADR 0016 section 3): a new method is a new class, never a new switch branch. */
export interface IPaymentMethodRule {
  readonly method: string;
  /** The role the money lands in: cash, bank, mobile_money or card_clearing. */
  readonly debitRole: AccountRole;
  /** False only for cash. */
  readonly needsExternalRef: boolean;
}
