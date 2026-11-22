import { createHash, randomBytes } from 'node:crypto';
import type { ISessionTokens } from './contracts/ISessionTokens.js';

/** ADR 0018 section 2: 32 bytes from crypto.randomBytes, base64url; stored as SHA-256 only. */
export class SessionTokens implements ISessionTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): Uint8Array {
    return createHash('sha256').update(token, 'utf8').digest();
  }
}
