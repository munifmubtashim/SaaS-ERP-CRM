import type { z } from 'zod';
import type {
  vehicleUnitStatusSchema,
  registrationStepSchema,
  vehicleUnitSchema,
  vehicleUnitDetailSchema,
  reservationDraftSchema,
} from '../schemas/vehicle.schema.js';

/** Vehicle types: z.infer of the shared schemas (provisional view shapes, see the schema file). */
export type VehicleUnitStatus = z.infer<typeof vehicleUnitStatusSchema>;
export type RegistrationStep = z.infer<typeof registrationStepSchema>;
export type VehicleUnit = z.infer<typeof vehicleUnitSchema>;
export type VehicleUnitDetail = z.infer<typeof vehicleUnitDetailSchema>;
export type ReservationDraft = z.infer<typeof reservationDraftSchema>;
