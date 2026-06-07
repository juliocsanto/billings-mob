/**
 * Integration tests — GET /api/users/search
 *
 * S8-04 (CA-003): Endpoint para busca de instrutoras por email.
 * Remove o acesso direto ao Supabase do frontend (useInstructorLink.ts).
 *
 * Contrato:
 *   GET /api/users/search?role=instructor&email=<email>
 *   → 200: { data: { id, display_name, role } }
 *   → 400: role inválido ou email ausente/inválido
 *   → 401: sem Authorization header
 *   → 404: instrutora não encontrada
 *
 * LGPD: resposta NUNCA inclui email, phone, notes, relations.
 *
 * TDD: testes escritos ANTES da implementação (RED fase).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_STUDENT_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MOCK_INSTRUCTOR_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const STUDENT_JWT = 'mock.student.jwt';
const INSTRUCTOR_JWT = 'mock.instructor.jwt';

const studentHeaders = {
  Authorization: `Bearer ${STUDENT_JWT}`,
  'Content-Type': 'application/json',
};

const instructorHeaders = {
  Authorization: `Bearer ${INSTRUCTOR_JWT}`,
  'Content-Type': 'application/json',
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock('../_lib/supabaseClient', () => ({
  createAuthenticatedClient: vi.fn((jwt: string) => {
    const isInstructor = jwt.includes('instructor');
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: isInstructor ? MOCK_INSTRUCTOR_ID : MOCK_STUDENT_ID,
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === 'user_profiles') {
          // For requireAuth role lookup — first call in middleware
          // Return a factory that can be used for both requireAuth and the handler
          return mockFrom(table);
        }
        return mockFrom(table);
      },
    };
  }),
  createServiceClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

import app from '../users/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInstructorProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_INSTRUCTOR_ID,
    // Supabase retorna full_name; o endpoint faz o alias para display_name na resposta
    full_name: 'Ana Instrutora',
    role: 'instructor',
    ...overrides,
  };
}

// ─── GET /api/users/search ───────────────────────────────────────────────────

describe('GET /api/users/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await app.request('/api/users/search?role=instructor&email=ana@example.com');

    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when email query param is missing', async () => {
    // Auth mock for requireAuth
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
    });

    const res = await app.request('/api/users/search?role=instructor', { headers: studentHeaders });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is not a valid email address', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
    });

    const res = await app.request('/api/users/search?role=instructor&email=not-an-email', { headers: studentHeaders });

    expect(res.status).toBe(400);
  });

  it('returns 400 when role is different from "instructor"', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
    });

    const res = await app.request('/api/users/search?role=admin&email=admin@example.com', { headers: studentHeaders });

    expect(res.status).toBe(400);
  });

  it('returns 400 when role param is missing', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
    });

    const res = await app.request('/api/users/search?email=ana@example.com', { headers: studentHeaders });

    expect(res.status).toBe(400);
  });

  it('returns 200 with { id, display_name, role } when instructor is found', async () => {
    const instructor = makeInstructorProfile();
    let callCount = 0;

    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // requireAuth: role lookup
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
        };
      }
      // handler: instructor search
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: instructor, error: null }),
      };
    });

    const res = await app.request('/api/users/search?role=instructor&email=ana%40example.com', { headers: studentHeaders });

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { id: string; display_name: string; role: string } };
    expect(json.data.id).toBe(MOCK_INSTRUCTOR_ID);
    expect(json.data.display_name).toBe('Ana Instrutora');
    expect(json.data.role).toBe('instructor');
  });

  it('returns 200 response does NOT contain email field (LGPD)', async () => {
    const instructor = makeInstructorProfile({ email: 'ana@example.com' }); // has email in DB row
    let callCount = 0;

    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: instructor, error: null }),
      };
    });

    const res = await app.request('/api/users/search?role=instructor&email=ana%40example.com', { headers: studentHeaders });

    const json = await res.json() as Record<string, unknown>;
    const jsonStr = JSON.stringify(json);
    expect(jsonStr).not.toContain('"email"');
    expect(jsonStr).not.toContain('"phone"');
    expect(jsonStr).not.toContain('ana@example.com');
  });

  it('returns 404 when instructor is not found', async () => {
    let callCount = 0;

    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      };
    });

    const res = await app.request('/api/users/search?role=instructor&email=notfound%40example.com', { headers: studentHeaders });

    expect(res.status).toBe(404);
  });

  it('returns 200 when instructor searches for another instructor by email', async () => {
    const instructor = makeInstructorProfile();
    let callCount = 0;

    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'instructor' }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: instructor, error: null }),
      };
    });

    const res = await app.request('/api/users/search?role=instructor&email=ana%40example.com', { headers: instructorHeaders });

    expect(res.status).toBe(200);
  });
});
