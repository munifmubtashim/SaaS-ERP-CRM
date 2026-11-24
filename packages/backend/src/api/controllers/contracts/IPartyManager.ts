import type {
  CreatePartyBody,
  Party,
  PartyDetail,
  PartyListQuery,
  PartyListResponse,
  PermissionCode,
  UpdatePartyBody,
} from '@erp/shared';

/** Who is asking: the signed-in user, the request's branch and the codes that apply (ADR 0056 section 4). */
export interface PartyCaller {
  userId: string;
  branchId: string | null;
  permissions: readonly PermissionCode[];
}

/** What PartyController needs (ADR 0056 section 4). Owned by api; businessLogic's PartyManager satisfies it. */
export interface IPartyManager {
  list(query: PartyListQuery): Promise<PartyListResponse>;
  get(id: string): Promise<PartyDetail>;
  create(input: CreatePartyBody, caller: PartyCaller): Promise<Party>;
  edit(id: string, edit: UpdatePartyBody, caller: PartyCaller): Promise<Party>;
  deactivate(id: string, version: number): Promise<Party>;
}
