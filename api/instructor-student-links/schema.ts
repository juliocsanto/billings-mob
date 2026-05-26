import { z } from 'zod';

export const CreateLinkSchema = z.object({
  instructor_id: z.string().uuid(),
});

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;

export const PatchLinkSchema = z
  .object({
    action: z.enum(['accept', 'revoke']),
  })
  .strict();

export type PatchLinkInput = z.infer<typeof PatchLinkSchema>;
