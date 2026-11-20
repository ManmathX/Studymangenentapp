import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors/app-error.js';
import type { AuthContext } from '../http/types.js';

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): AuthContext;
}

/** Reads `Authorization: Bearer <token>` and stores the verified identity in `res.locals.auth`. */
export function createAuthenticate(verifier: AccessTokenVerifier): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Sign in to continue', 'TOKEN_MISSING'));
      return;
    }
    try {
      res.locals.auth = verifier.verifyAccessToken(header.slice('Bearer '.length).trim());
      next();
    } catch (error) {
      next(error);
    }
  };
}
