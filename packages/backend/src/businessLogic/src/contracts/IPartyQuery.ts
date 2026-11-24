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

/** What PartyManager needs from the database. Owned by businessLogic; dal's PartyQuery satisfies it. */
export interface IPartyQuery {
  find(id: string): Promise<PartyRecord | null>;
  create(input: NewPartyRecord): Promise<PartyRecord>;
  /** Null when the version is stale or the party isn't visible in the request's scope. */
  edit(id: string, version: number, changes: PartyRecordChanges): Promise<PartyRecord | null>;
}
