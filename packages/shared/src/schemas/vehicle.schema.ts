import { z } from 'zod';
import { moneySchema } from '../utils/money.js';

/**
 * Vehicle pack, Zod schemas shared by backend and frontend. Owner: Munif. Chassis, engine number and BRTA live here
 * only, never in the core (spec O-11).
 *
 * PROVISIONAL VIEW SHAPES for the units and registration on the Products screen (design/owner-dashboard/Bikes.dc.html).
 * They don't decide how a sale or a reservation posts (ADR 0022) or where a unit is stocked (ADR 0034). No cost here:
 * a unit's cost is a hidden field (ADR 0020 section 3).
 */

/** "sold" is sold but not yet handed over. */
export const vehicleUnitStatusSchema = z.enum(['in_stock', 'reserved', 'sold', 'delivered']);
export const registrationStepSchema = z.enum(['papers_sent', 'fee_paid', 'registered', 'plate_fitted']);

export const vehicleUnitSchema = z.object({
  chassisNo: z.string().min(1),
  engineNo: z.string().min(1),
  model: z.string().min(1),
  colour: z.string().min(1),
  branchName: z.string().min(1),
  status: vehicleUnitStatusSchema,
  receivedOn: z.iso.date(),
  daysInStock: z.number().int().nonnegative(),
  customerName: z.string().min(1).nullable(),
});

export const vehicleUnitDetailSchema = vehicleUnitSchema.extend({
  invoiceNumber: z.string().min(1).nullable(),
  /** The booking advance received for a reserved unit (a liability, never revenue: invariant 8). */
  advance: moneySchema.nullable(),
  registrationDone: z.array(registrationStepSchema),
});

/** The Reserve form: the customer and the advance received. */
export const reservationDraftSchema = z.object({
  chassisNo: z.string().min(1),
  customerName: z.string().trim().min(1).max(200),
  advance: moneySchema.refine((value) => !value.startsWith('-') && !/^0+\.00$/.test(value), 'More than zero'),
});
