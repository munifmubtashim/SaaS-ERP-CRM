import { BaseDTO, type BaseRow } from './BaseDTO.js';

export type PartyKind = 'person' | 'company';
export type PartyStatus = 'active' | 'inactive';

/** A party row as plain values (ADR 0019 section 2). Business-wide, so no branch; money is a string. */
export interface PartyRow extends Omit<BaseRow, 'branchId'> {
  code: string;
  name: string;
  /** Null when blank: never turned into "" (the F2 form sends null). */
  nameBn: string | null;
  kind: PartyKind;
  isCustomer: boolean;
  isSupplier: boolean;
  phoneE164: string;
  altPhoneE164: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  /** numeric(18,2) as text, e.g. "50000.00"; null means no limit. Never a JavaScript number. */
  creditLimit: string | null;
  payTermDays: number | null;
  status: PartyStatus;
  isWalkIn: boolean;
  assignedTo: string | null;
  createdBranchId: string | null;
}

/** Party module: row DTO (dal). Mapped from plain rows, never a Prisma type. Owner: Farhan. No NID here, ever. */
export class PartyDTO extends BaseDTO {
  readonly code: string;
  readonly name: string;
  readonly nameBn: string | null;
  readonly kind: PartyKind;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  readonly phoneE164: string;
  readonly altPhoneE164: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly area: string | null;
  readonly creditLimit: string | null;
  readonly payTermDays: number | null;
  readonly status: PartyStatus;
  readonly isWalkIn: boolean;
  readonly assignedTo: string | null;
  readonly createdBranchId: string | null;

  private constructor(row: PartyRow) {
    super({ ...row, branchId: null });
    this.code = row.code;
    this.name = row.name;
    this.nameBn = row.nameBn;
    this.kind = row.kind;
    this.isCustomer = row.isCustomer;
    this.isSupplier = row.isSupplier;
    this.phoneE164 = row.phoneE164;
    this.altPhoneE164 = row.altPhoneE164;
    this.email = row.email;
    this.address = row.address;
    this.area = row.area;
    this.creditLimit = row.creditLimit;
    this.payTermDays = row.payTermDays;
    this.status = row.status;
    this.isWalkIn = row.isWalkIn;
    this.assignedTo = row.assignedTo;
    this.createdBranchId = row.createdBranchId;
  }

  static fromRow(row: PartyRow): PartyDTO {
    return new PartyDTO(row);
  }
}
