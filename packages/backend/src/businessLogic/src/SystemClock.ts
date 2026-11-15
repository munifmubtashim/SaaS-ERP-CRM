import type { IClock } from './contracts/IClock.js';

/** The real clock. Tests inject a fixed IClock instead. */
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
