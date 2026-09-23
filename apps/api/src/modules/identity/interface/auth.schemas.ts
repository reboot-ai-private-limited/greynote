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

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutAllBodySchema = z.object({
  userId: z.string().min(1),
});
