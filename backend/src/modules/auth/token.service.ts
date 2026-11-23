import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { AuthContext, Role } from '../../common/http/types.js';
import type { AccessTokenVerifier } from '../../common/middleware/authenticate.js';

export interface TokenSettings {
  secret: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
}

const ROLES: readonly Role[] = ['student', 'admin'];

export class TokenService implements AccessTokenVerifier {
  constructor(private readonly settings: TokenSettings) {}

  signAccessToken(auth: AuthContext): string {
    return jwt.sign({ role: auth.role }, this.settings.secret, {
      algorithm: 'HS256',
      subject: auth.userId,
      issuer: this.settings.issuer,
      audience: this.settings.audience,
      expiresIn: this.settings.accessTtlSeconds,
      jwtid: randomUUID(),
    });
  }

  verifyAccessToken(token: string): AuthContext {
    try {
      const payload = jwt.verify(token, this.settings.secret, {
        algorithms: ['HS256'],
        issuer: this.settings.issuer,
        audience: this.settings.audience,
      });
      if (typeof payload === 'string' || !payload.sub || !ROLES.includes(payload.role as Role)) {
        throw new UnauthorizedError('Your session is not valid', 'TOKEN_INVALID');
      }
      return { userId: payload.sub, role: payload.role as Role };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError)
        throw new UnauthorizedError('Your session has expired', 'TOKEN_EXPIRED');
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Your session is not valid', 'TOKEN_INVALID');
    }
  }

  /** 256 bits of randomness, URL-safe. Only its hash is stored. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newFamilyId(): string {
    return randomUUID();
  }
}
