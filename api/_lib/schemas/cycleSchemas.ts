/**
 * Zod schemas for cycle endpoints.
 * ADR-002: Hono.js + TypeScript + Zod validation
 */
import { z } from 'zod';

const DateString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD format');

export const CreateCycleSchema = z.object({
  start_date: DateString,
  end_date: DateString.nullable().optional(),
  apex_date: DateString.nullable().optional(),
});

export type CreateCycleInput = z.infer<typeof CreateCycleSchema>;

export const PatchCycleSchema = z
  .object({
    end_date: DateString.nullable().optional(),
    apex_date: DateString.nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  );

export type PatchCycleInput = z.infer<typeof PatchCycleSchema>;
