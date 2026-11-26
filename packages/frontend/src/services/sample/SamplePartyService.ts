import type { CustomerDues, PartyDetail, PartyListQueryInput, PartyListResponse } from '@erp/shared';
import type { IPartyService } from '../partyService';

/**
 * The customer screens' sample (keys `party` and `party.dues`): the customers from MockPartyService and the dues from
 * MockSalesService (#33, #51), both invented and scoped to the sample active business. The screens mark them "Demo
 * data".
 */
export class SamplePartyService implements IPartyService {
  constructor(
    private readonly customers: Pick<IPartyService, 'list' | 'get'>,
    private readonly duesSample: Pick<IPartyService, 'dues'>,
  ) {}
  list = (query: PartyListQueryInput): Promise<PartyListResponse> => this.customers.list(query);
  get = (id: string): Promise<PartyDetail> => this.customers.get(id);
  dues = (partyId: string): Promise<CustomerDues> => this.duesSample.dues(partyId);
}
