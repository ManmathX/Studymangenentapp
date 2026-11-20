import { z } from '../../common/zod.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const registerBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter your name').max(60),
    email,
    password,
  })
  .openapi('RegisterRequest');

export const loginBodySchema = z
  .strictObject({
    email,
    password: z.string().min(1, 'Enter your password').max(128),
  })
  .openapi('LoginRequest');

export const refreshBodySchema = z
  .strictObject({ refreshToken: z.string().min(20).max(200) })
  .openapi('RefreshRequest');

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['student', 'admin']),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  })
  .openapi('User');

export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().openapi({ description: 'Access token lifetime in seconds' }),
  })
  .openapi('TokenPair');

export const sessionSchema = z
  .object({ user: userSchema, tokens: tokenPairSchema, onboarded: z.boolean() })
  .openapi('Session');

export const meSchema = z.object({ user: userSchema, onboarded: z.boolean() }).openapi('Me');

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
