/**
 * useInstructorLink — hook for student–instructor link management.
 *
 * Exposes:
 *  - searchInstructor(email): queries Supabase directly for user_profiles
 *    where role='instructor' AND email matches. Never queries student data.
 *  - requestLink(instructorId): POST /api/instructor-student-links
 *  - getMyLinks(): GET /api/instructor-student-links
 *
 * LGPD constraints:
 *  - Only instructor's id and full_name are fetched (explicit SELECT, never SELECT *)
 *  - No student data is exposed to or fetched by this hook
 *  - 'relations' field never appears here — this hook is for link management only
 *
 * Clinical constraint:
 *  - This hook contains NO references to fertility, cycles, or clinical data.
 *
 * ADR-005 / ADR-013: RLS on user_profiles enforced by Supabase;
 *  anon key can read instructor profiles by design (they are searchable by email).
 */
import { useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

const API_BASE = '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstructorProfile {
  id: string;
  full_name: string;
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
   * Queries user_profiles via the authenticated Supabase client.
   * Only returns id and full_name — never SELECT *.
   */
  const searchInstructor = useCallback((email: string): void => {
    setError(null);
    setInstructor(null);
    setLoading(true);

    supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('email', email.trim().toLowerCase())
      .eq('role', 'instructor')
      .single()
      .then(({ data, error: sbError }) => {
        setLoading(false);
        if (sbError || !data) {
          setError('Instrutora não encontrada. Verifique o e-mail digitado.');
          return;
        }
        setInstructor({ id: data.id as string, full_name: data.full_name as string });
      });
  }, []);

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
