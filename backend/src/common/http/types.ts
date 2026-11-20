export type Role = 'student' | 'admin';

export interface AuthContext {
  userId: string;
  role: Role;
}

export interface RequestMeta {
  requestId: string;
  ip: string;
  userAgent: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      requestId: string;
      auth?: AuthContext;
    }
  }
}
