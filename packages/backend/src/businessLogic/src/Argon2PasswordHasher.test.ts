import { describe, expect, it, vi } from 'vitest';
import { ARGON2_SETTINGS, Argon2PasswordHasher } from './Argon2PasswordHasher.js';

/** ADR 0018 section 5: argon2id at 19 MiB, time cost 2, parallelism 1; older settings are detected for rehash. */
describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes with argon2id and the ADR 0018 settings, and verifies only the right password', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(hasher.verify(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'correct horse batterY')).resolves.toBe(false);
  });

  it('makes the dummy hash when it is built, so the first unknown login pays no extra hash (Farhan, #95)', async () => {
    const spy = vi.spyOn(Argon2PasswordHasher.prototype, 'hash');
    try {
      const fresh = new Argon2PasswordHasher();
      expect(spy).toHaveBeenCalledTimes(1);
      await expect(fresh.dummyHash()).resolves.toMatch(/^\$argon2id\$/);
      await fresh.dummyHash();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('salts every hash', async () => {
    expect(await hasher.hash('same password')).not.toBe(await hasher.hash('same password'));
  });

  it('11. a hash with lower settings needs a rehash; a current one does not', async () => {
    const old = new Argon2PasswordHasher({ ...ARGON2_SETTINGS, memoryCost: 8192, timeCost: 1 });
    expect(hasher.needsRehash(await old.hash('pw-123456'))).toBe(true);
    expect(hasher.needsRehash(await hasher.hash('pw-123456'))).toBe(false);
  });

  it('a malformed stored hash verifies as false and needs a rehash, never throws', async () => {
    await expect(hasher.verify('not-a-hash', 'anything')).resolves.toBe(false);
    expect(hasher.needsRehash('not-a-hash')).toBe(true);
  });

  it('the dummy hash is a real argon2id hash with the current settings, made once', async () => {
    const dummy = await hasher.dummyHash();
    expect(hasher.needsRehash(dummy)).toBe(false);
    expect(await hasher.dummyHash()).toBe(dummy);
  });
});
