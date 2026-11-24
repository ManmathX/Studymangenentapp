import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from '../../common/errors/app-error.js';

/** What we trust from a verified Google ID token. */
export interface GoogleIdentity {
  /** Google's stable account id (`sub`). */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleIdTokenVerifier {
  /** Checks the signature, issuer, expiry and audience. Throws UnauthorizedError when any fail. */
  verify(idToken: string): Promise<GoogleIdentity>;
}

/** Verifies ID tokens against Google's published keys using google-auth-library. */
export class GoogleAuthLibraryVerifier implements GoogleIdTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly audiences: string[]) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedError('Google sign-in failed. Try again.', 'GOOGLE_TOKEN_INVALID');
    }
    if (!payload?.sub || !payload.email)
      throw new UnauthorizedError('Google did not share an email address', 'GOOGLE_TOKEN_INVALID');
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name?.trim() || null,
    };
  }
}
