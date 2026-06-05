/**
 * useObservationSync — hook for syncing local observations to the API.
 *
 * Sprint 2 item #8: sends client_vector_clock in PATCH requests.
 * The API (ADR-004) uses this to detect concurrent edits between
 * the student (PWA) and instructor (billings-web dashboard).
 *
 * Workflow:
 *  1. Student edits observation locally (App.jsx handleDaySave)
 *  2. If online + authenticated: call syncObservation(observationId, date, formData)
 *  3. Hook increments local vector clock, sends PATCH with client_vector_clock
 *  4. On success: merges server clock back into localStorage
 *  5. On conflict (409): stores conflict flag for display to user
 *  6. On offline: queues the sync for when connectivity is restored
 *
 * Note: The API endpoints require observations to exist (POST first, then PATCH).
 * This hook handles both POST (create) and PATCH (update) cases.
 *
 * LGPD: relations field is sent to the API but NEVER logged by the API.
 * Clinical constraint: never interprets fertile/infertile status.
 */
import { useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { tickAndSaveClock, mergeServerClock } from '../lib/vectorClock';

const API_BASE = '/api';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error' | 'offline';

export interface ObservationData {
  stamp: string;
  mucus: string | null;
  bleeding: string | null;
  sensacao: string | null;
  tipo_observacao: string | null;
  notes: string;
  relations: boolean;
  cycle_id?: string;
}

export interface SyncResult {
  status: 'synced' | 'conflict' | 'error' | 'offline';
  observationId?: string;
  conflictVersionId?: string;
  error?: string;
}

/**
 * Returns a stable function to sync one observation to the API.
 * Requires an active Supabase session for the Authorization header.
 */
export function useObservationSync(session: Session | null) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const syncObservation = useCallback(
    async (
      date: string,
      formData: ObservationData,
      existingObservationId?: string,
    ): Promise<SyncResult> => {
      if (!session?.access_token) {
        return { status: 'error', error: 'No active session' };
      }

      if (!navigator.onLine) {
        setSyncStatus('offline');
        return { status: 'offline' };
      }

      setSyncStatus('syncing');

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      };

      try {
        if (existingObservationId) {
          // ── PATCH existing observation ────────────────────────────────────
          const userId = session.user.id;
          const clientClock = tickAndSaveClock(existingObservationId, userId);

          const res = await fetch(`${API_BASE}/observations/${existingObservationId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              stamp: formData.stamp,
              mucus: formData.mucus,
              bleeding: formData.bleeding,
              sensacao: formData.sensacao,
              tipo_observacao: formData.tipo_observacao,
              notes: formData.notes,
              relations: formData.relations,
              client_vector_clock: clientClock,
            }),
          });

          if (res.status === 409) {
            // Conflict detected by server — two concurrent edits
            setSyncStatus('conflict');
            const body = await res.json().catch(() => ({}));
            return {
              status: 'conflict',
              observationId: existingObservationId,
              conflictVersionId: body?.conflict_version_id,
            };
          }

          if (!res.ok) {
            setSyncStatus('error');
            return { status: 'error', error: `PATCH failed: ${res.status}` };
          }

          // Merge server clock back
          const body = await res.json().catch(() => ({}));
          if (body?.vector_clock) {
            mergeServerClock(existingObservationId, body.vector_clock);
          }

          setSyncStatus('synced');
          return { status: 'synced', observationId: existingObservationId };
        } else {
          // ── POST new observation ──────────────────────────────────────────
          const res = await fetch(`${API_BASE}/observations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              date,
              stamp: formData.stamp,
              mucus: formData.mucus,
              bleeding: formData.bleeding,
              sensacao: formData.sensacao,
              tipo_observacao: formData.tipo_observacao,
              notes: formData.notes,
              relations: formData.relations,
              cycle_id: formData.cycle_id,
            }),
          });

          if (!res.ok) {
            setSyncStatus('error');
            return { status: 'error', error: `POST failed: ${res.status}` };
          }

          const body = await res.json().catch(() => ({}));
          const newId: string | undefined = body?.id;

          // Initialize local clock for the new observation
          if (newId && body?.vector_clock) {
            mergeServerClock(newId, body.vector_clock);
          }

          setSyncStatus('synced');
          return { status: 'synced', observationId: newId };
        }
      } catch (err) {
        if (!navigator.onLine) {
          setSyncStatus('offline');
          return { status: 'offline' };
        }
        // CC-010: TypeError typically indicates a network failure (e.g. "Failed to fetch").
        // Return a user-facing message instead of exposing the raw browser error string.
        if (err instanceof TypeError) {
          setSyncStatus('error');
          return { status: 'error', error: 'Erro de conexão. Verifique sua internet.' };
        }
        setSyncStatus('error');
        return { status: 'error', error: String(err) };
      }
    },
    [session],
  );

  return { syncStatus, syncObservation };
}
