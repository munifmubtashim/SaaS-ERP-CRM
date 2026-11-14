/** Result of the database probe. Not a business row, so it does not extend BaseDTO. */
export interface HealthDTO {
  databaseOk: boolean;
  latencyMs: number;
}
