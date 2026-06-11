/**
 * Zod schemas for observation endpoints.
 *
 * Clinical constraint (ADR § 3.3, inviolable):
 *   stamp must ONLY be: sangramento | seco | muco | apice | semMuco
 *   NEVER: 'fertil', 'infertil', 'seguro', 'inseguro'
 *
 * Immutability rule (ADR-004):
 *   - date is immutable after creation (cannot be patched)
 *   - vector_clock is managed server-side (clients cannot override it)
 */
import { z } from 'zod';

// ISO 8601 date string: YYYY-MM-DD
const DateString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD format');

export const StampValues = ['sangramento', 'seco', 'muco', 'apice', 'semMuco'] as const;

/**
 * CC-002/CC-003: Canonical column list for SELECT on the observations table.
 * Use this constant everywhere to avoid DRY violations and RLS drift.
 * LGPD: relations and notes are included because callers that need to forward
 * them to the client or preserve them in version snapshots must request them
 * explicitly — never via SELECT *.
 */
export const OBSERVATION_SELECT_COLUMNS =
  'id, date, stamp, mucus, bleeding, sensacao, tipo_observacao, relations, notes, vector_clock, version, cycle_id, created_at, updated_at' as const;

/**
 * DDD-003: Value Object for the `data` field stored in observation_versions.
 * Excludes LGPD-sensitive fields (notes, relations) — those are stripped at write time
 * via sanitizeForAuditLog before the snapshot is persisted.
 */
export const ObservationSnapshotSchema = z.object({
  stamp: z.enum(StampValues),
  mucus: z.enum(['opaco', 'cremoso', 'transparente', 'elastico']).nullable().optional(),
  bleeding: z.enum(['intenso', 'moderado', 'leve', 'manchas']).nullable().optional(),
  sensacao: z.enum(['seca', 'molhada', 'lubrificante']).nullable().optional(),
  tipo_observacao: z.enum(['sangue', 'manchas', 'outro']).nullable().optional(),
  cycle_id: z.string().uuid().nullable().optional(),
  version: z.number().int().min(1).optional(),
  observacao_descricao: z.string().max(500).nullable().optional(),
});

export type ObservationSnapshot = z.infer<typeof ObservationSnapshotSchema>;
export const MucusValues = ['opaco', 'cremoso', 'transparente', 'elastico'] as const;
export const BleedingValues = ['intenso', 'moderado', 'leve', 'manchas'] as const;
export const SensacaoValues = ['seca', 'molhada', 'lubrificante'] as const;
export const TipoObservacaoValues = ['sangue', 'manchas', 'outro'] as const;

/**
 * Schema for POST /api/observations — creates a new observation.
 */
export const CreateObservationSchema = z.object({
  date: DateString,
  stamp: z.enum(StampValues),
  mucus: z.enum(MucusValues).nullable().optional(),
  bleeding: z.enum(BleedingValues).nullable().optional(),
  sensacao: z.enum(SensacaoValues).nullable().optional(),
  tipo_observacao: z.enum(TipoObservacaoValues).nullable().optional(),
  // LGPD sensitive — validated but never logged
  relations: z.boolean(),
  // LGPD sensitive — validated but never logged
  notes: z.string().max(500).optional().default(''),
  cycle_id: z.string().uuid().optional(),
  // Clinical observation text for sangramento — not LGPD-sensitive
  observacao_descricao: z.string().max(500).nullable().optional(),
});

export type CreateObservationInput = z.infer<typeof CreateObservationSchema>;

/**
 * Schema for PATCH /api/observations/:id — partial update.
 *
 * Excluded fields (immutable or server-managed):
 *   - date: immutable after creation
 *   - vector_clock: managed server-side (server increments; client sends client_vector_clock)
 *   - version: managed server-side
 *   - user_id: determined from JWT
 *   - created_at / updated_at: managed by database triggers
 *
 * client_vector_clock (ARCH-001 / CODE-001 fix):
 *   The client must send the vector_clock it had when it last READ this observation.
 *   The server compares it against the current DB clock to detect concurrent edits.
 *   If omitted, conflict detection is skipped (backward-compatible).
 */
export const PatchObservationSchema = z
  .object({
    stamp: z.enum(StampValues).optional(),
    mucus: z.enum(MucusValues).nullable().optional(),
    bleeding: z.enum(BleedingValues).nullable().optional(),
    sensacao: z.enum(SensacaoValues).nullable().optional(),
    tipo_observacao: z.enum(TipoObservacaoValues).nullable().optional(),
    relations: z.boolean().optional(),
    notes: z.string().max(500).optional(),
    cycle_id: z.string().uuid().nullable().optional(),
    // Clinical observation text for sangramento — not LGPD-sensitive
    observacao_descricao: z.string().max(500).nullable().optional(),
    // ADR-004: client sends the clock it had when it last read this record.
    // Server uses this to detect concurrent edits (not the newly-incremented clock).
    client_vector_clock: z.record(z.string(), z.number()).optional(),
  })
  .strict() // rejects unknown keys (date, vector_clock, version, etc. are not allowed)
  .refine(
    (data) => {
      // At least one domain field must be provided (client_vector_clock alone is not enough)
      const domainKeys = ['stamp', 'mucus', 'bleeding', 'sensacao', 'tipo_observacao', 'relations', 'notes', 'cycle_id', 'observacao_descricao'];
      return domainKeys.some((k) => k in data && data[k as keyof typeof data] !== undefined);
    },
    { message: 'At least one field must be provided for update' }
  );

export type PatchObservationInput = z.infer<typeof PatchObservationSchema>;

/**
 * Schema for query parameters on GET /api/observations
 */
export const ListObservationsQuerySchema = z.object({
  cycle_id: z.string().uuid().optional(),
  from: DateString.optional(),
  to: DateString.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(31),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListObservationsQuery = z.infer<typeof ListObservationsQuerySchema>;
