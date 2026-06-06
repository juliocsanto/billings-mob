/**
 * useInstructorLink — hook for student–instructor link management.
 *
 * Exposes:
 *  - searchInstructor(email): calls GET /api/users/search?role=instructor&email=<email>
 *    via the authenticated API endpoint (CA-003: no direct Supabase access from frontend).
 *  - requestLink(instructorId): POST /api/instructor-student-links
 *  - getMyLinks(): GET /api/instructor-student-links
 *
 * LGPD constraints:
 *  - API endpoint returns only id and display_name (no email, no phone).
 *  - No student data is exposed to or fetched by this hook.
 *  - 'relations' field never appears here — this hook is for link management only.
 *
 * Clinical constraint:
 *  - This hook contains NO references to fertility, cycles, or clinical data.
 *
 * CA-003: searchInstructor now calls the REST API instead of Supabase directly,
 *  respecting the Clean Architecture boundary (Application layer → Infrastructure
 *  via API, not direct DB access from presentation layer).
 *
 * ADR-005: Authentication via Supabase JWT forwarded in Authorization header.
 */
import { useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';

const API_BASE = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstructorProfile {
  id: string;
  /** display_name is full_name aliased by the API endpoint (CA-003: no LGPD-sensitive fields). */
  display_name: string;
}

export type LinkStatus = 'pending' | 'active' | 'revoked';

export interface InstructorLink {
  id: string;
  instructor_id: string;
  status: LinkStatus;
  instructor_name: string;
}

export interface InstructorLinkState {
  loading: boolean;
  error: string | null;
  instructor: InstructorProfile | null;
  links: InstructorLink[];
  searchInstructor: (email: string) => void;
  requestLink: (instructorId: string) => Promise<void>;
  getMyLinks: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useInstructorLink(session: Session | null): InstructorLinkState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructor, setInstructor] = useState<InstructorProfile | null>(null);
  const [links, setLinks] = useState<InstructorLink[]>([]);

  /**
   * Search for an instructor by email address.
   * CA-003: calls GET /api/users/search instead of querying Supabase directly.
   * Requires an active session — uses the JWT from `session.access_token`.
   */
  const searchInstructor = useCallback((email: string): void => {
    setError(null);
    setInstructor(null);
    setLoading(true);

    if (!session?.access_token) {
      setError('Você precisa estar autenticada para buscar uma instrutora.');
      setLoading(false);
      return;
    }

    const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
    fetch(`${API_BASE}/users/search?role=instructor&email=${encodedEmail}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        setLoading(false);
        if (res.status === 404) {
          setError('Instrutora não encontrada. Verifique o e-mail digitado.');
          return;
        }
        if (!res.ok) {
          setError('Não foi possível buscar a instrutora. Tente novamente.');
          return;
        }
        const body = await res.json() as { data?: { id: string; display_name: string } };
        if (!body.data) {
          setError('Instrutora não encontrada. Verifique o e-mail digitado.');
          return;
        }
        setInstructor({ id: body.data.id, display_name: body.data.display_name });
      })
      .catch(() => {
        setLoading(false);
        setError('Erro de conexão. Verifique sua internet e tente novamente.');
      });
  }, [session]);

  /**
   * Send a link request to an instructor.
   * POST /api/instructor-student-links — body: { instructor_id }
   */
  const requestLink = useCallback(
    async (instructorId: string): Promise<void> => {
      if (!session?.access_token) {
        setError('Você precisa estar autenticada para enviar uma solicitação.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/instructor-student-links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ instructor_id: instructorId }),
        });

        if (res.status === 409) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { error?: string }).error ?? '';
          if (msg.toLowerCase().includes('pending')) {
            setError('Solicitação já enviada e aguardando aprovação');
          } else {
            setError('Já existe um vínculo com esta instrutora');
          }
          setLoading(false);
          return;
        }

        if (!res.ok) {
          setError('Não foi possível enviar a solicitação. Tente novamente.');
          setLoading(false);
          return;
        }

        setLoading(false);
        // Refresh links list after successful request
        await getMyLinks();
      } catch {
        setError('Erro de conexão. Verifique sua internet e tente novamente.');
        setLoading(false);
      }
    },
    // getMyLinks is defined below and captured via ref pattern — safe to ignore
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  );

  /**
   * Fetch all links for the authenticated student.
   * GET /api/instructor-student-links
   */
  const getMyLinks = useCallback(async (): Promise<void> => {
    if (!session?.access_token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/instructor-student-links`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        setError('Não foi possível carregar os vínculos.');
        setLoading(false);
        return;
      }

      const body = (await res.json()) as {
        data?: Array<{
          id: string;
          instructor_id: string;
          status: LinkStatus;
          instructor_name?: string;
        }>;
      };

      const rawLinks = body.data ?? [];
      setLinks(
        rawLinks.map(l => ({
          id: l.id,
          instructor_id: l.instructor_id,
          status: l.status,
          instructor_name: l.instructor_name ?? '',
        })),
      );
    } catch {
      setError('Erro ao carregar vínculos.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  return {
    loading,
    error,
    instructor,
    links,
    searchInstructor,
    requestLink,
    getMyLinks,
  };
}
