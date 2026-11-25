import {
  customerDuesSchema,
  partyDetailSchema,
  partyListResponseSchema,
  partySchema,
  type CreatePartyInput,
  type CustomerDues,
  type Party,
  type UpdatePartyInput,
  type PartyDetail,
  type PartyListQueryInput,
  type PartyListResponse,
} from '@erp/shared';
import type { IHttpClient, IHttpPatch } from './HttpClient';

/** What the customer screens need from Party. One small method per use (interface segregation). */
export interface IPartyService {
  /** One page of parties in the active business. The HTTP client adds the business header (ADR 0007). */
  list(query: PartyListQueryInput): Promise<PartyListResponse>;
  /** One customer's profile; 404 when the party is not in the active business. */
  get(id: string): Promise<PartyDetail>;
  /** What one customer owes, with their open invoices (F5, ADR 0026 section 3); 404 when not in the business. */
  dues(partyId: string): Promise<CustomerDues>;
  /** Adds a customer (ADR 0056): 409 party.possible_duplicate names the matches unless `confirmDuplicate`. */
  create(input: CreatePartyInput): Promise<Party>;
  /** Edits with the version read: 409 party.version_conflict when someone changed it since. */
  update(id: string, input: UpdatePartyInput): Promise<Party>;
}

/** Each call is real or sample on its own key: list and get on `party`, dues on `party.dues` (frontend-wiring.md). */
export type PartyCall = 'list' | 'get' | 'dues' | 'create' | 'update';

/**
 * Party module: frontend API calls, one method per endpoint. Owner: Farhan.
 * The customer routes exist (#209, #216); the dues route comes with F5.
 */
export class PartyService implements IPartyService {
  constructor(protected readonly http: IHttpClient & IHttpPatch) {}

  /** GET /v1/parties. Only the filters that are set go into the query string. */
  list(query: PartyListQueryInput): Promise<PartyListResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return this.http.getJson(`/v1/parties${qs ? `?${qs}` : ''}`, partyListResponseSchema);
  }

  /** GET /v1/parties/:id. The shared schema drops every unknown key, so a full NID never gets through. */
  get(id: string): Promise<PartyDetail> {
    return this.http.getJson(`/v1/parties/${encodeURIComponent(id)}`, partyDetailSchema);
  }

  /** POST /v1/parties. */
  create(input: CreatePartyInput): Promise<Party> {
    return this.http.postJson('/v1/parties', input, partySchema);
  }

  /** PATCH /v1/parties/:id. */
  update(id: string, input: UpdatePartyInput): Promise<Party> {
    return this.http.patchJson(`/v1/parties/${encodeURIComponent(id)}`, input, partySchema);
  }

  /** GET /v1/parties/:id/dues (F5). */
  dues(partyId: string): Promise<CustomerDues> {
    return this.http.getJson(`/v1/parties/${encodeURIComponent(partyId)}/dues`, customerDuesSchema);
  }
}

/** Real or sample per call, like ReportServiceSwitch: the screens show the Demo data badge for a sample call. */
export class PartyServiceSwitch implements IPartyService {
  constructor(
    private readonly real: IPartyService,
    private readonly sample: IPartyService,
    private readonly useSample: (call: PartyCall) => boolean,
  ) {}
  private pick(call: PartyCall): IPartyService {
    return this.useSample(call) ? this.sample : this.real;
  }
  list = (query: PartyListQueryInput) => this.pick('list').list(query);
  get = (id: string) => this.pick('get').get(id);
  dues = (partyId: string) => this.pick('dues').dues(partyId);
  create = (input: CreatePartyInput) => this.pick('create').create(input);
  update = (id: string, input: UpdatePartyInput) => this.pick('update').update(id, input);
}
