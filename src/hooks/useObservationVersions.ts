/**
 * useObservationVersions — fetches version history for a single observation.
 *
 * Sprint 2 item #11: exposes the GET /api/observations/:id/versions endpoint
 * to the DayDetailModal for history display.
 *
 * Params:
 *   observationId — UUID of the observation (null → skip fetch, return [])
 *   jwt           — Supabase access token (null → skip fetch, return [])
 *
 * Returns: { versions, loading, error }
 *   versions — array of ObservationVersion objects, ordered by created_at DESC
 *   loading  — true while the request is in flight
 *   error    — string error message, or null if no error
 *
 * ADR-004: versions are created by the API on every PATCH. This hook reads them.
 *
 * LGPD: version.data contains only { stamp, mucus, bleeding } — never relations or notes.
 *   This is enforced at the API write site. We pass through what the API returns.
 *   The hook never logs, stores, or transforms this data.
 *
 * Clinical constraint (§ 3.3 ARCHITECTURE.md — inviolable):
 *   This hook NEVER interprets stamp values as fertile/infertile/safe/unsafe.
 *   It returns raw stamp strings for the UI to render via the STAMPS constant.
 */
import { useState, useEffect } from 'react';

const API_BASE = '/api';

export interface ObservationVersionData {
  stamp: string;
  mucus: string | null;
  bleeding: string | null;
  sensacao: string | null;
  tipo_observacao: string | null;
  // LGPD: 'relations' and 'notes' are NEVER stored in observation_versions.data
  // and therefore NEVER appear here. Do not add these fields.
}

export interface ObservationVersion {
  id: string;
  observation_id: string;
  vector_clock: Record<string, number>;
  data: ObservationVersionData;
  author_id: string;
  conflict_resolved: boolean;
  created_at: string;
}

export interface UseObservationVersionsResult {
  versions: ObservationVersion[];
  loading: boolean;
  error: string | null;
}

export function useObservationVersions(
  observationId: string | null,
  jwt: string | null,
): UseObservationVersionsResult {
  const [versions, setVersions] = useState<ObservationVersion[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip fetch if either required param is missing
    if (!observationId || !jwt) {
      setVersions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchVersions = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/observations/${observationId}/versions`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch versions: ${res.status}`);
        }

        const body = await res.json();

        if (!cancelled) {
          // body.data is already ordered DESC by the API
          setVersions((body.data as ObservationVersion[]) ?? []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setVersions([]);
          setLoading(false);
        }
      }
    };

    void fetchVersions();

    return () => {
      cancelled = true;
    };
  }, [observationId, jwt]);

  return { versions, loading, error };
}
