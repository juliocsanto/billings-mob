/**
 * useObservationData — local-first observation store with server sync (C-3).
 *
 * Replaces the localStorage-only data flow that App.jsx used until Sprint 6:
 * observations now hydrate from the API on login and every save is pushed
 * through useObservationSync (vector clock, ADR-004), with an offline queue
 * flushed when connectivity returns.
 *
 * Semantics:
 *  - Anonymous (no session): behaves exactly like before — localStorage only,
 *    demo data on first run (try-out mode). Nothing is sent anywhere.
 *  - Authenticated: local data renders immediately, then the server state
 *    (GET /api/cycles + GET /api/observations) replaces obs/history; entries
 *    still waiting in the offline queue are re-applied on top. A user with no
 *    server data and no local data gets a real empty state — never demo data.
 *  - Legacy local data (saved before sync existed) stays visible but is not
 *    auto-uploaded; new saves sync going forward.
 *
 * LGPD: relations/notes are sent to the API (which never logs them) and are
 * never logged here. Clinical constraint: this hook never interprets cycles.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { loadUserData, saveUserData } from '../utils/storage.js';
import { today, fmtMonthYear, addDays } from '../utils/dates.js';
import {
  useObservationSync,
  type ObservationData,
  type SyncStatus,
} from './useObservationSync';

const API_BASE = '/api';

export interface ObservationForm {
  stamp: string | null;
  mucus: string | null;
  bleeding: string | null;
  sensacao: string | null;
  tipo_observacao: string | null;
  observacao_descricao: string | null;
  notes: string;
  relations: boolean;
}

export interface CycleHistoryEntry {
  start: string;
  label: string;
  obs: Record<string, ObservationForm>;
}

interface PendingEntry {
  date: string;
  form: ObservationForm;
  newCycleStart?: string; // set when this save also starts a new cycle
}

interface ServerObservation {
  id: string;
  date: string;
  cycle_id: string | null;
  stamp: string;
  mucus: string | null;
  bleeding: string | null;
  sensacao: string | null;
  tipo_observacao: string | null;
  observacao_descricao?: string | null;
  notes: string | null;
  relations: boolean;
}

interface ServerCycle {
  id: string;
  start_date: string;
  end_date: string | null;
  apex_date: string | null;
  status: 'active' | 'archived';
}

function toForm(o: ServerObservation): ObservationForm {
  return {
    stamp: o.stamp,
    mucus: o.mucus,
    bleeding: o.bleeding,
    sensacao: o.sensacao,
    tipo_observacao: o.tipo_observacao,
    observacao_descricao: o.observacao_descricao ?? null,
    notes: o.notes ?? '',
    relations: o.relations,
  };
}

function toSyncPayload(form: ObservationForm): ObservationData {
  return {
    stamp: form.stamp ?? '',
    mucus: form.mucus,
    bleeding: form.bleeding,
    sensacao: form.sensacao,
    tipo_observacao: form.tipo_observacao,
    notes: form.notes ?? '',
    relations: form.relations,
  };
}

export interface UseObservationDataResult {
  loaded: boolean;
  hydrating: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  obs: Record<string, ObservationForm>;
  cycleStart: string;
  history: CycleHistoryEntry[];
  saveObservation: (date: string, form: ObservationForm) => Promise<void>;
  startNewCycle: (form: ObservationForm, newStart: string) => Promise<void>;
}

export function useObservationData(
  session: Session | null,
  buildDemoData: () => { cycleStart: string; obs: Record<string, ObservationForm>; history: CycleHistoryEntry[] },
): UseObservationDataResult {
  const userId = session?.user?.id ?? null;
  const { syncStatus, syncObservation } = useObservationSync(session);

  const [loaded, setLoaded] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [obs, setObs] = useState<Record<string, ObservationForm>>({});
  const [cycleStart, setCycleStart] = useState<string>(today());
  const [history, setHistory] = useState<CycleHistoryEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Mutable mirrors so async sync callbacks never read stale state.
  const stateRef = useRef({
    obs: {} as Record<string, ObservationForm>,
    cycleStart: today(),
    history: [] as CycleHistoryEntry[],
    serverIds: {} as Record<string, string>,
    activeCycleId: null as string | null,
    pending: [] as PendingEntry[],
  });

  const persist = useCallback(() => {
    const s = stateRef.current;
    const prev = loadUserData(userId) ?? {};
    saveUserData(
      {
        ...prev,
        cycleStart: s.cycleStart,
        obs: s.obs,
        history: s.history,
        serverIds: s.serverIds,
        activeCycleId: s.activeCycleId,
        pendingSync: s.pending,
      },
      userId,
    );
    setObs({ ...s.obs });
    setCycleStart(s.cycleStart);
    setHistory([...s.history]);
    setPendingCount(s.pending.length);
  }, [userId]);

  const authHeaders = useCallback((): Record<string, string> | null => {
    if (!session?.access_token) return null;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, [session]);

  /** Ensures the active cycle exists server-side; returns its id or null. */
  const ensureCycle = useCallback(async (): Promise<string | null> => {
    const s = stateRef.current;
    if (s.activeCycleId) return s.activeCycleId;
    const headers = authHeaders();
    if (!headers || !navigator.onLine) return null;
    try {
      const res = await fetch(`${API_BASE}/cycles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ start_date: s.cycleStart }),
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      const id: string | undefined = body?.data?.id;
      if (id) {
        s.activeCycleId = id;
        return id;
      }
      return null;
    } catch {
      return null;
    }
  }, [authHeaders]);

  /** Pushes one entry to the server. Returns true when it can leave the queue. */
  const pushEntry = useCallback(
    async (entry: PendingEntry): Promise<boolean> => {
      const s = stateRef.current;
      if (entry.newCycleStart) {
        const headers = authHeaders();
        if (!headers || !navigator.onLine) return false;
        // Close the previous active cycle, then open the new one.
        if (s.activeCycleId) {
          try {
            await fetch(`${API_BASE}/cycles/${s.activeCycleId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({
                end_date: addDays(entry.newCycleStart, -1),
                status: 'archived',
              }),
            });
          } catch {
            return false;
          }
          s.activeCycleId = null;
        }
        s.cycleStart = entry.newCycleStart;
        const cycleId = await ensureCycle();
        if (!cycleId) return false;
      }

      const cycleId = await ensureCycle();
      if (!cycleId) return false;

      const payload = { ...toSyncPayload(entry.form), cycle_id: cycleId };
      const result = await syncObservation(entry.date, payload, s.serverIds[entry.date]);
      if (result.status === 'synced' && result.observationId) {
        s.serverIds[entry.date] = result.observationId;
        return true;
      }
      // Conflicts leave the queue too — resolution belongs to the instrutora
      // (ADR-004); retrying the same clock would re-conflict forever.
      return result.status === 'conflict';
    },
    [authHeaders, ensureCycle, syncObservation],
  );

  const flushQueue = useCallback(async () => {
    const s = stateRef.current;
    if (!navigator.onLine || !session) return;
    while (s.pending.length > 0) {
      const ok = await pushEntry(s.pending[0]);
      if (!ok) break;
      s.pending.shift();
    }
    persist();
  }, [session, pushEntry, persist]);

  // ── Initial load + server hydration ─────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    const local = loadUserData(userId);

    if (local) {
      s.obs = local.obs ?? {};
      s.cycleStart = local.cycleStart ?? today();
      s.history = local.history ?? [];
      s.serverIds = local.serverIds ?? {};
      s.activeCycleId = local.activeCycleId ?? null;
      s.pending = local.pendingSync ?? [];
    } else if (!userId) {
      // Anonymous first run: demo/try-out data, exactly like before.
      const demo = buildDemoData();
      s.obs = demo.obs;
      s.cycleStart = demo.cycleStart;
      s.history = demo.history;
    } else {
      // Authenticated first run: real empty state — never demo data.
      s.obs = {};
      s.cycleStart = today();
      s.history = [];
      s.serverIds = {};
      s.activeCycleId = null;
      s.pending = [];
    }
    persist();
    setLoaded(true);

    if (!session || !navigator.onLine) return;

    let cancelled = false;
    const hydrate = async () => {
      const headers = authHeaders();
      if (!headers) return;
      setHydrating(true);
      try {
        const [cyclesRes, obsRes] = await Promise.all([
          fetch(`${API_BASE}/cycles`, { headers }),
          fetch(`${API_BASE}/observations?limit=100`, { headers }),
        ]);
        if (!cyclesRes.ok || !obsRes.ok || cancelled) return;
        // Guard against non-JSON responses (e.g. a dev server without the API
        // answering /api/* with the SPA fallback) — treat as "no server data".
        const cyclesBody = await cyclesRes.json().catch(() => null);
        const obsBody = await obsRes.json().catch(() => null);
        if (!cyclesBody || !obsBody) return;
        const cycles: ServerCycle[] = cyclesBody.data ?? [];
        const observations: ServerObservation[] = obsBody.data ?? [];

        if (cycles.length === 0 && observations.length === 0) return; // nothing server-side yet

        const active = cycles.find((c) => c.status === 'active') ?? null;
        const archived = cycles
          .filter((c) => c.status === 'archived')
          .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

        const byCycle = new Map<string, ServerObservation[]>();
        for (const o of observations) {
          const key = o.cycle_id ?? 'none';
          byCycle.set(key, [...(byCycle.get(key) ?? []), o]);
        }

        const activeObs: Record<string, ObservationForm> = {};
        for (const o of byCycle.get(active?.id ?? 'none') ?? []) {
          activeObs[o.date] = toForm(o);
        }

        s.serverIds = {};
        for (const o of observations) s.serverIds[o.date] = o.id;

        s.activeCycleId = active?.id ?? null;
        s.cycleStart = active?.start_date ?? today();
        s.obs = activeObs;
        s.history = archived.map((c) => {
          const cycleObs: Record<string, ObservationForm> = {};
          for (const o of byCycle.get(c.id) ?? []) cycleObs[o.date] = toForm(o);
          return { start: c.start_date, label: fmtMonthYear(c.start_date), obs: cycleObs };
        });

        // Offline edits queued before hydration win over the server snapshot
        // until they are pushed.
        for (const p of s.pending) {
          if (p.newCycleStart) continue;
          s.obs[p.date] = p.form;
        }

        persist();
        await flushQueue();
      } catch {
        // Network failure mid-hydration: keep local state; the offline queue
        // and the 'online' listener cover the retry path.
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Flush the queue whenever connectivity returns ────────────────────────
  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushQueue]);

  // ── Public API ────────────────────────────────────────────────────────────
  const saveObservation = useCallback(
    async (date: string, form: ObservationForm) => {
      const s = stateRef.current;
      s.obs = { ...s.obs, [date]: form };
      persist();
      if (!session) return; // anonymous try-out mode — local only

      const entry: PendingEntry = { date, form };
      if (!navigator.onLine) {
        s.pending = [...s.pending.filter((p) => p.date !== date || p.newCycleStart), entry];
        persist();
        return;
      }
      const ok = await pushEntry(entry);
      if (!ok) {
        s.pending = [...s.pending.filter((p) => p.date !== date || p.newCycleStart), entry];
      }
      persist();
    },
    [session, pushEntry, persist],
  );

  const startNewCycle = useCallback(
    async (form: ObservationForm, newStart: string) => {
      const s = stateRef.current;
      // Archive locally (same shape App.jsx always used).
      const archivedEntry: CycleHistoryEntry = {
        start: s.cycleStart,
        obs: s.obs,
        label: fmtMonthYear(s.cycleStart),
      };
      s.history = [archivedEntry, ...s.history].slice(0, 12);
      s.obs = { [newStart]: form };
      persist(); // cycleStart still old here; entry carries the transition

      if (!session) {
        s.cycleStart = newStart;
        persist();
        return;
      }

      const entry: PendingEntry = { date: newStart, form, newCycleStart: newStart };
      if (!navigator.onLine) {
        s.pending = [...s.pending, entry];
        s.cycleStart = newStart;
        persist();
        return;
      }
      const ok = await pushEntry(entry);
      if (!ok) {
        s.pending = [...s.pending, entry];
      }
      s.cycleStart = newStart;
      persist();
    },
    [session, pushEntry, persist],
  );

  return {
    loaded,
    hydrating,
    syncStatus,
    pendingCount,
    obs,
    cycleStart,
    history,
    saveObservation,
    startNewCycle,
  };
}
