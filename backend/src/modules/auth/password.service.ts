import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /** Performs a comparable amount of work and always fails; used when no account matches. */
  verifyAgainstDummy(password: string): Promise<false>;
}

/** Argon2id with the OWASP-recommended minimum (19 MiB memory, 2 iterations, 1 lane). */
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /** Spends the same work as a real check so unknown emails can't be found by timing. */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-only');
    await argon2.verify(await this.dummyHash, password);
    return false;
  }
}
