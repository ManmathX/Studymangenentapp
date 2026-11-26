import { PERMISSIONS, ROLES } from '../../common/http/permissions.js';
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

export const changePasswordBodySchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: password,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: 'Choose a password different from the current one',
    path: ['newPassword'],
  })
  .openapi('ChangePasswordRequest');

export const forgotPasswordBodySchema = z.strictObject({ email }).openapi('ForgotPasswordRequest');

export const resetPasswordBodySchema = z
  .strictObject({
    email,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
    newPassword: password,
  })
  .openapi('ResetPasswordRequest');

export const deleteAccountBodySchema = z
  .strictObject({
    password: z
      .string()
      .min(1, 'Enter your password')
      .max(128)
      .optional()
      .openapi({ description: 'Required unless the account only signs in with Google' }),
  })
  .openapi('DeleteAccountRequest');

export const googleLoginBodySchema = z
  .strictObject({
    idToken: z
      .string()
      .min(20)
      .max(4096)
      .openapi({ description: 'ID token from Google Sign-In on the device' }),
  })
  .openapi('GoogleLoginRequest');

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(ROLES),
    permissions: z
      .array(z.enum(PERMISSIONS))
      .openapi({ description: 'What this account may do in the admin portal' }),
    hasPassword: z.boolean(),
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
  .object({ user: userSchema, tokens: tokenPairSchema })
  .openapi('Session');

export const meSchema = z.object({ user: userSchema }).openapi('Me');

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
