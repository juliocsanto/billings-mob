// @vitest-environment jsdom
/**
 * useObservationData unit tests — C-3 sync wiring
 *
 * AC: anonymous first run loads demo data and never calls the API.
 * AC: authenticated first run with an empty server shows a real empty state
 *     (never demo data).
 * AC: hydration replaces local state with the server snapshot (active cycle →
 *     obs, archived cycles → history) and records server ids (subsequent save
 *     PATCHes instead of POSTing).
 * AC: online save creates the cycle when missing (POST /cycles) and POSTs the
 *     observation.
 * AC: offline save queues the entry; the 'online' event flushes the queue.
 * AC: startNewCycle archives the previous cycle (PATCH), opens a new one
 *     (POST /cycles) and saves the first observation.
 *
 * LGPD: test fixtures use relations:false and empty notes only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { useObservationData, type ObservationForm } from '../useObservationData';
import { today, addDays } from '../../utils/dates.js';

const USER_ID = 'user-e2e-1';
const session = {
  access_token: 'tok-1',
  user: { id: USER_ID },
} as unknown as Session;

const demo = () => ({
  cycleStart: addDays(today(), -3),
  obs: { [addDays(today(), -3)]: form('sangramento') },
  history: [],
});

function form(stamp: string | null): ObservationForm {
  return {
    stamp,
    mucus: null,
    bleeding: stamp === 'sangramento' ? 'moderado' : null,
    sensacao: null,
    tipo_observacao: null,
    observacao_descricao: null,
    notes: '',
    relations: false,
  };
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let routes: Record<string, (call: Call) => { status: number; body: unknown }>;

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const call: Call = {
        url: String(url),
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      };
      calls.push(call);
      const key = `${method} ${String(url).split('?')[0]}`;
      const route = routes[key];
      if (!route) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      const { status, body } = route(call);
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  calls = [];
  routes = {};
  setOnline(true);
  mockFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useObservationData — anonymous', () => {
  it('loads demo data on first run and never calls the API', async () => {
    const { result } = renderHook(() => useObservationData(null, demo));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(Object.keys(result.current.obs)).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it('saves locally without any network call', async () => {
    const { result } = renderHook(() => useObservationData(null, demo));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.saveObservation(today(), form('seco'));
    });
    expect(result.current.obs[today()]?.stamp).toBe('seco');
    expect(calls).toHaveLength(0);
  });
});

describe('useObservationData — authenticated, empty server', () => {
  it('shows a real empty state — never demo data', async () => {
    const demoSpy = vi.fn(demo);
    const { result } = renderHook(() => useObservationData(session, demoSpy));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    expect(result.current.obs).toEqual({});
    expect(result.current.history).toEqual([]);
    expect(demoSpy).not.toHaveBeenCalled();
  });
});

describe('useObservationData — hydration', () => {
  const ACTIVE = 'cycle-active-1';
  const OLD = 'cycle-old-1';
  const d1 = addDays(today(), -2);
  const d2 = addDays(today(), -1);
  const oldDate = addDays(today(), -30);

  beforeEach(() => {
    routes['GET /api/cycles'] = () => ({
      status: 200,
      body: {
        data: [
          { id: ACTIVE, start_date: d1, end_date: null, apex_date: null, status: 'active' },
          { id: OLD, start_date: oldDate, end_date: addDays(today(), -10), apex_date: null, status: 'archived' },
        ],
      },
    });
    routes['GET /api/observations'] = () => ({
      status: 200,
      body: {
        data: [
          { id: 'obs-1', date: d1, cycle_id: ACTIVE, stamp: 'sangramento', mucus: null, bleeding: 'intenso', sensacao: null, tipo_observacao: 'sangue', notes: '', relations: false },
          { id: 'obs-2', date: d2, cycle_id: ACTIVE, stamp: 'seco', mucus: null, bleeding: null, sensacao: 'seca', tipo_observacao: null, notes: '', relations: false },
          { id: 'obs-old', date: oldDate, cycle_id: OLD, stamp: 'muco', mucus: 'cremoso', bleeding: null, sensacao: 'molhada', tipo_observacao: null, notes: '', relations: false },
        ],
      },
    });
  });

  it('replaces local state with the server snapshot', async () => {
    const { result } = renderHook(() => useObservationData(session, demo));
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    await waitFor(() => expect(Object.keys(result.current.obs)).toHaveLength(2));
    expect(result.current.cycleStart).toBe(d1);
    expect(result.current.obs[d2]?.stamp).toBe('seco');
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].start).toBe(oldDate);
    expect(result.current.history[0].obs[oldDate]?.mucus).toBe('cremoso');
  });

  it('records server ids: a later save PATCHes instead of POSTing', async () => {
    routes[`PATCH /api/observations/obs-2`] = () => ({
      status: 200,
      body: { vector_clock: { [USER_ID]: 2 } },
    });
    const { result } = renderHook(() => useObservationData(session, demo));
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    await waitFor(() => expect(Object.keys(result.current.obs)).toHaveLength(2));

    await act(async () => {
      await result.current.saveObservation(d2, form('muco'));
    });
    const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('obs-2'));
    expect(patch).toBeDefined();
    expect(patch?.body?.stamp).toBe('muco');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/observations'))).toBe(false);
  });
});

describe('useObservationData — saving online', () => {
  it('creates the cycle when missing, then POSTs the observation', async () => {
    routes['POST /api/cycles'] = () => ({
      status: 201,
      body: { data: { id: 'cycle-new-1', start_date: today(), status: 'active' } },
    });
    routes['POST /api/observations'] = () => ({
      status: 201,
      body: { id: 'obs-new-1', vector_clock: { [USER_ID]: 1 } },
    });

    const { result } = renderHook(() => useObservationData(session, demo));
    await waitFor(() => expect(result.current.hydrating).toBe(false));

    await act(async () => {
      await result.current.saveObservation(today(), form('seco'));
    });

    const cyclePost = calls.find((c) => c.method === 'POST' && c.url.endsWith('/cycles'));
    const obsPost = calls.find((c) => c.method === 'POST' && c.url.endsWith('/observations'));
    expect(cyclePost).toBeDefined();
    expect(obsPost).toBeDefined();
    expect(obsPost?.body?.cycle_id).toBe('cycle-new-1');
    expect(obsPost?.body?.relations).toBe(false);
    expect(result.current.pendingCount).toBe(0);
  });
});

describe('useObservationData — offline queue', () => {
  it('queues the save while offline and flushes on the online event', async () => {
    const { result } = renderHook(() => useObservationData(session, demo));
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    const callsAfterHydration = calls.length;

    setOnline(false);
    await act(async () => {
      await result.current.saveObservation(today(), form('seco'));
    });
    expect(result.current.obs[today()]?.stamp).toBe('seco'); // optimistic local
    expect(result.current.pendingCount).toBe(1);
    expect(calls.length).toBe(callsAfterHydration); // nothing sent

    routes['POST /api/cycles'] = () => ({
      status: 201,
      body: { data: { id: 'cycle-q-1', start_date: today(), status: 'active' } },
    });
    routes['POST /api/observations'] = () => ({
      status: 201,
      body: { id: 'obs-q-1', vector_clock: { [USER_ID]: 1 } },
    });

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/observations'))).toBe(true);
  });
});

describe('useObservationData — startNewCycle', () => {
  it('archives the previous cycle, opens a new one and saves the first observation', async () => {
    const d1 = addDays(today(), -20);
    routes['GET /api/cycles'] = () => ({
      status: 200,
      body: { data: [{ id: 'cycle-a', start_date: d1, end_date: null, apex_date: null, status: 'active' }] },
    });
    routes['GET /api/observations'] = () => ({
      status: 200,
      body: { data: [{ id: 'obs-a', date: d1, cycle_id: 'cycle-a', stamp: 'sangramento', mucus: null, bleeding: 'leve', sensacao: null, tipo_observacao: 'sangue', notes: '', relations: false }] },
    });
    routes['PATCH /api/cycles/cycle-a'] = () => ({ status: 200, body: { data: {} } });
    routes['POST /api/cycles'] = () => ({
      status: 201,
      body: { data: { id: 'cycle-b', start_date: today(), status: 'active' } },
    });
    routes['POST /api/observations'] = () => ({
      status: 201,
      body: { id: 'obs-b', vector_clock: { [USER_ID]: 1 } },
    });

    const { result } = renderHook(() => useObservationData(session, demo));
    await waitFor(() => expect(result.current.hydrating).toBe(false));
    await waitFor(() => expect(result.current.cycleStart).toBe(d1));

    await act(async () => {
      await result.current.startNewCycle(form('sangramento'), today());
    });

    const archive = calls.find((c) => c.method === 'PATCH' && c.url.includes('cycle-a'));
    expect(archive?.body?.status).toBe('archived');
    expect(archive?.body?.end_date).toBe(addDays(today(), -1));
    const newCycle = calls.find((c) => c.method === 'POST' && c.url.endsWith('/cycles'));
    expect(newCycle?.body?.start_date).toBe(today());
    expect(result.current.cycleStart).toBe(today());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].start).toBe(d1);
    expect(result.current.obs[today()]?.stamp).toBe('sangramento');
  });
});
