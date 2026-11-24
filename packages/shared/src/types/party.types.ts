import type { z } from 'zod';
import type {
  createPartySchema,
  partyDetailSchema,
  partyKindSchema,
  partyListItemSchema,
  partyListQuerySchema,
  partyListResponseSchema,
  partyRoleSchema,
  partySchema,
  partyStatusSchema,
  updatePartySchema,
} from '../schemas/party.schema.js';

/** Party module, types inferred from the Zod schemas. Owner: Farhan. */
export type PartyKind = z.infer<typeof partyKindSchema>;
export type PartyStatus = z.infer<typeof partyStatusSchema>;
export type PartyRole = z.infer<typeof partyRoleSchema>;
export type Party = z.infer<typeof partySchema>;
export type PartyDetail = z.infer<typeof partyDetailSchema>;
export type PartyListItem = z.infer<typeof partyListItemSchema>;
/** What the caller may send (limit optional, as text or number). */
export type PartyListQueryInput = z.input<typeof partyListQuerySchema>;
/** What the server works with after parsing (limit filled in). */
export type PartyListQuery = z.infer<typeof partyListQuerySchema>;
export type PartyListResponse = z.infer<typeof partyListResponseSchema>;

/** POST /v1/parties: what the form sends (phones as typed) and what the server works with (E.164). */
export type CreatePartyInput = z.input<typeof createPartySchema>;
export type CreatePartyBody = z.infer<typeof createPartySchema>;
/** PATCH /v1/parties/:id. */
export type UpdatePartyInput = z.input<typeof updatePartySchema>;
export type UpdatePartyBody = z.infer<typeof updatePartySchema>;
