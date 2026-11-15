/** Current time, injected so rules that depend on time can be tested with a fixed clock. */
export interface IClock {
  now(): Date;
}
