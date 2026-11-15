/** Result of the database probe. Not a business row, so it does not extend BaseDTO. */
export class HealthDTO {
  private constructor(
    readonly databaseOk: boolean,
    readonly latencyMs: number,
  ) {}

  static fromProbe(databaseOk: boolean, latencyMs: number): HealthDTO {
    return new HealthDTO(databaseOk, Math.round(latencyMs));
  }
}
