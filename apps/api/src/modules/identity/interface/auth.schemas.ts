import { z } from 'zod';
import { PLATFORMS } from '../domain/userSession.entity.js';
import { passwordSchema } from './password.schema.js';

export const loginBodySchema = z.object({
  employeeCode: z.string().min(1),
  password: passwordSchema,
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  deviceModel: z.string().min(1),
  platform: z.enum(PLATFORMS),
});

// Optional: a browser sends the token as an httpOnly cookie instead (see refreshCookie.ts).
export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const deleteAccountBodySchema = z.object({
  password: passwordSchema,
});

// No complexity rules: this only checks the password they already have.
export const deleteAccountPublicBodySchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const logoutAllBodySchema = z.object({
  userId: z.string().min(1),
});
