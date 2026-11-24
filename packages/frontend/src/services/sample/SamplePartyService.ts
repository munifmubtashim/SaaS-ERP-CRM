import type {
  CreatePartyInput,
  CustomerDues,
  Party,
  PartyDetail,
  PartyListQueryInput,
  PartyListResponse,
  UpdatePartyInput,
} from '@erp/shared';
import type { IPartyService } from '../partyService';

/**
 * The customer screens' sample (keys `party` and `party.dues`): the customers from MockPartyService and the dues from
 * MockSalesService (#33, #51), both invented and scoped to the sample active business. The screens mark them "Demo
 * data".
 */
export class SamplePartyService implements IPartyService {
  constructor(
    private readonly customers: Omit<IPartyService, 'dues'>,
    private readonly duesSample: Pick<IPartyService, 'dues'>,
  ) {}
  list = (query: PartyListQueryInput): Promise<PartyListResponse> => this.customers.list(query);
  get = (id: string): Promise<PartyDetail> => this.customers.get(id);
  dues = (partyId: string): Promise<CustomerDues> => this.duesSample.dues(partyId);
  create = (input: CreatePartyInput): Promise<Party> => this.customers.create(input);
  update = (id: string, input: UpdatePartyInput): Promise<Party> => this.customers.update(id, input);
}
