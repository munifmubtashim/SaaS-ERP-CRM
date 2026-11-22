import { AppError } from '@erp/shared';
import type { IAuthQuery, LoginUser } from './contracts/IAuthQuery.js';
import type { IClock } from './contracts/IClock.js';
import type { IPasswordHasher } from './contracts/IPasswordHasher.js';

/** Who passed the password check. The session is created from this once auth_session exists (ADR 0018 part 1). */
export interface VerifiedLogin {
  userId: string;
  organizationId: string;
}

/**
 * Auth module: business rules. No Express, no SQL. Owner: Munif.
 *
 * Login (ADR 0018 section 4). Every refusal is the same 401 with the same message, whatever the reason (unknown
 * login, locked, deactivated, wrong password), and an unknown or locked login still spends one verification
 * against the dummy hash, so neither the answer nor its timing says whether the account exists (ADR 0050 (b)).
 */
export class AuthManager {
  constructor(
    protected readonly query: IAuthQuery,
    private readonly hasher: IPasswordHasher,
    private readonly clock: IClock,
  ) {}

  async verifyLogin(login: string, password: string): Promise<VerifiedLogin> {
    const user = await this.query.findUserForLogin(login);
    const now = this.clock.now();
    if (!user || !user.isActive || this.isLocked(user, now)) {
      await this.hasher.verify(await this.hasher.dummyHash(), password);
      throw wrongLogin();
    }
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      await this.query.recordFailedLogin(user, now);
      throw wrongLogin();
    }
    const newHash = this.hasher.needsRehash(user.passwordHash) ? await this.hasher.hash(password) : null;
    await this.query.recordSuccessfulLogin(user, newHash);
    return { userId: user.id, organizationId: user.organizationId };
  }

  private isLocked(user: LoginUser, now: Date): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
  }
}

function wrongLogin(): AppError {
  return new AppError('UNAUTHENTICATED', 'Login or password is wrong.');
}
