/** Password hashing (ADR 0018 section 5). The settings live in the implementation and in each hash string. */
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  /** False for a wrong password or a malformed hash; never throws for either. */
  verify(hash: string, password: string): Promise<boolean>;
  /** True when the hash was made with other settings (or can't be read), so login stores a fresh one. */
  needsRehash(hash: string): boolean;
  /** A real hash of a random secret, made once: unknown and locked logins verify against it, for equal timing. */
  dummyHash(): Promise<string>;
}
