/** A party row as PartyManager needs it (dal's PartyDTO satisfies it). Money is a string; there is no NID. */
export interface PartyRecord {
  id: string;
  businessId: string;
  code: string;
  name: string;
  nameBn: string | null;
  kind: 'person' | 'company';
  isCustomer: boolean;
  isSupplier: boolean;
  phoneE164: string;
  altPhoneE164: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  creditLimit: string | null;
  payTermDays: number | null;
  status: 'active' | 'inactive';
  isWalkIn: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A new party. No business id: the Query takes it from the request's scope. */
export type NewPartyRecord = Omit<
  PartyRecord,
  'id' | 'businessId' | 'status' | 'isWalkIn' | 'version' | 'createdAt' | 'updatedAt'
> & { createdBranchId: string | null; createdBy: string };

export type PartyRecordChanges = Partial<Omit<NewPartyRecord, 'code' | 'createdBranchId' | 'createdBy'>> & {
  status?: 'active' | 'inactive';
};

/** One page of the customer list (ADR 0056 section 4): by name, then id; `after` is the last row of the page before. */
export interface PartyListFilter {
  limit: number;
  /** Contains, case-insensitive, on name, code and phone. */
  search?: string;
  status?: 'active' | 'inactive';
  /** Only customers who are also suppliers. */
  alsoSupplier?: boolean;
  after?: { name: string; id: string };
}

/** An active party of the business with one of the phones looked up (ADR 0019 section 4). Never the NID. */
export interface PartyPhoneMatch {
  id: string;
  code: string;
  name: string;
  phoneE164: string;
  altPhoneE164: string | null;
}

/** What PartyManager needs from the database. Owned by businessLogic; dal's PartyQuery satisfies it. */
export interface IPartyQuery {
  find(id: string): Promise<PartyRecord | null>;
  /** Customers of the request's businesses (the walk-in party included). */
  list(filter: PartyListFilter): Promise<PartyRecord[]>;
  /** Active, non-walk-in parties with any of `phones` as phone or alternative phone, except `exceptId`. */
  findByPhones(phones: string[], exceptId: string | null): Promise<PartyPhoneMatch[]>;
  create(input: NewPartyRecord): Promise<PartyRecord>;
  /** Null when the version is stale or the party isn't visible in the request's scope. */
  edit(id: string, version: number, changes: PartyRecordChanges): Promise<PartyRecord | null>;
}
