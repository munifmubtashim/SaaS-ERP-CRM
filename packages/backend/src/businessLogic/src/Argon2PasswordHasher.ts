import { randomBytes } from 'node:crypto';
import { hash, parseOptions, verify } from '@node-rs/argon2';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';

/** argon2id at the OWASP minimum (ADR 0018 section 5): 19 MiB, time cost 2, parallelism 1. */
export const ARGON2_SETTINGS = {
  /** Argon2id. The library's Algorithm is a const enum, which isolated modules can't read; 2 is its value. */
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

type Argon2Settings = { algorithm: 2; memoryCost: number; timeCost: number; parallelism: number };

/** Password hashing with @node-rs/argon2 (prebuilt binaries, no install script). */
export class Argon2PasswordHasher implements IPasswordHasher {
  /** Made when the hasher is built (at startup), so the first unknown login pays no extra hash (Farhan, #95). */
  private dummy: Promise<string>;

  constructor(private readonly settings: Argon2Settings = ARGON2_SETTINGS) {
    this.dummy = this.makeDummy();
  }

  hash(password: string): Promise<string> {
    return hash(password, this.settings);
  }

  async verify(stored: string, password: string): Promise<boolean> {
    try {
      return await verify(stored, password);
    } catch {
      return false;
    }
  }

  needsRehash(stored: string): boolean {
    try {
      const found = parseOptions(stored);
      return (
        (found.algorithm as number) !== this.settings.algorithm ||
        found.memoryCost !== this.settings.memoryCost ||
        found.timeCost !== this.settings.timeCost ||
        found.parallelism !== this.settings.parallelism
      );
    } catch {
      return true;
    }
  }

  /** If making it at startup failed, the next call makes it again (once per call, never in a loop). */
  dummyHash(): Promise<string> {
    return this.dummy.catch(() => (this.dummy = this.makeDummy()));
  }

  /** The rejection is observed here, so a startup failure is never an unhandled rejection. */
  private makeDummy(): Promise<string> {
    const made = this.hash(randomBytes(32).toString('base64url'));
    made.catch(() => undefined);
    return made;
  }
}
