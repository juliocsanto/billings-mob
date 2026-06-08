// @vitest-environment jsdom
/**
 * Unit tests — useFeedback hooks (useListFeedback + useFeedbackDetail)
 *
 * Mocks: feedbackApi functions + supabase client (channel/realtime)
 *
 * LGPD: `relations` and `notes` must never appear in hook state.
 * Restrição clínica: no clinical terms in any test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { FeedbackItem } from '../../types/feedback';

// ─── Mock feedbackApi ─────────────────────────────────────────────────────────

const mockListFeedback = vi.fn();
const mockGetFeedback = vi.fn();

vi.mock('../../lib/feedbackApi', () => ({
  listFeedback: (...args: unknown[]) => mockListFeedback(...args),
  getFeedback: (...args: unknown[]) => mockGetFeedback(...args),
}));

// ─── Mock supabaseClient ──────────────────────────────────────────────────────

const mockUnsubscribe = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: mockUnsubscribe });
const mockOn = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn().mockResolvedValue(undefined);

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

// Setup mockOn chain: .on(...).subscribe() returns channel object
beforeEach(() => {
  vi.clearAllMocks();

  const channelObj = {
    on: mockOn,
    subscribe: mockSubscribe,
  };
  mockOn.mockReturnValue(channelObj);
  mockChannel.mockReturnValue(channelObj);
});

afterEach(() => {
  vi.clearAllMocks();
});

import { useListFeedback, useFeedbackDetail } from '../useFeedback';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TOKEN = 'mock.jwt.token';

const MOCK_FEEDBACK_ITEM: FeedbackItem = {
  id: 'fb-001',
  author_id: 'user-001',
  author_role: 'student',
  category: 'bug',
  title: 'Problema no registro de dados',
  content: 'O formulario nao salva os dados ao tentar registrar.',
  status: 'pending_triage',
  discount_applied: false,
  created_at: new Date().toISOString(),
};

// ─── useListFeedback ──────────────────────────────────────────────────────────

describe('useListFeedback', () => {
  it('returns empty items initially when token is null', () => {
    const { result } = renderHook(() => useListFeedback(null));
    expect(result.current.items).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns list of feedbacks when API responds with success', async () => {
    mockListFeedback.mockResolvedValueOnce({ data: [MOCK_FEEDBACK_ITEM], total: 1 });

    const { result } = renderHook(() => useListFeedback(MOCK_TOKEN));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].id).toBe('fb-001');
    expect(result.current.error).toBeNull();
  });

  it('shows loading state during fetch', async () => {
    let resolvePromise: (value: { data: FeedbackItem[]; total: number }) => void;
    const pending = new Promise<{ data: FeedbackItem[]; total: number }>((resolve) => {
      resolvePromise = resolve;
    });
    mockListFeedback.mockReturnValueOnce(pending);

    const { result } = renderHook(() => useListFeedback(MOCK_TOKEN));

    // loading should be true while pending
    expect(result.current.loading).toBe(true);

    // Resolve to complete fetch
    await act(async () => {
      resolvePromise!({ data: [], total: 0 });
      await pending;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error when API throws', async () => {
    mockListFeedback.mockRejectedValueOnce(new Error('API error 401: Unauthorized'));

    const { result } = renderHook(() => useListFeedback(MOCK_TOKEN));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('API error 401');
    expect(result.current.items).toEqual([]);
  });

  it('subscribes to Supabase realtime channel on mount', async () => {
    mockListFeedback.mockResolvedValueOnce({ data: [], total: 0 });

    renderHook(() => useListFeedback(MOCK_TOKEN));

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith('feedback-list-realtime');
    });
    expect(mockOn).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('does not subscribe to realtime when token is null', () => {
    const { result } = renderHook(() => useListFeedback(null));

    expect(result.current.items).toEqual([]);
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('refresh() function triggers a new API call', async () => {
    mockListFeedback.mockResolvedValue({ data: [MOCK_FEEDBACK_ITEM], total: 1 });

    const { result } = renderHook(() => useListFeedback(MOCK_TOKEN));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockListFeedback).toHaveBeenCalledTimes(2);
    });
  });

  it('items do not contain relations or notes fields', async () => {
    const itemWithoutLGPD = { ...MOCK_FEEDBACK_ITEM };
    mockListFeedback.mockResolvedValueOnce({ data: [itemWithoutLGPD], total: 1 });

    const { result } = renderHook(() => useListFeedback(MOCK_TOKEN));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const serialized = JSON.stringify(result.current.items);
    expect(serialized).not.toContain('"relations"');
    expect(serialized).not.toContain('"notes"');
  });
});

// ─── useFeedbackDetail ────────────────────────────────────────────────────────

describe('useFeedbackDetail', () => {
  it('returns null feedback initially when token is null', () => {
    const { result } = renderHook(() => useFeedbackDetail(null, 'fb-001'));
    expect(result.current.feedback).toBeNull();
    expect(result.current.comments).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns null feedback when feedbackId is null', () => {
    const { result } = renderHook(() => useFeedbackDetail(MOCK_TOKEN, null));
    expect(result.current.feedback).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('loads feedback detail and comments when token and id are provided', async () => {
    const mockComments = [
      {
        id: 'c-001',
        feedback_id: 'fb-001',
        author_id: 'user-001',
        author_role: 'student' as const,
        content: 'Concordo com a sugestao.',
        created_at: new Date().toISOString(),
      },
    ];

    mockGetFeedback.mockResolvedValueOnce({
      data: MOCK_FEEDBACK_ITEM,
      comments: mockComments,
    });

    const { result } = renderHook(() => useFeedbackDetail(MOCK_TOKEN, 'fb-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.feedback).toBeDefined();
    expect(result.current.feedback?.id).toBe('fb-001');
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('sets error when API throws', async () => {
    mockGetFeedback.mockRejectedValueOnce(new Error('API error 404: Not Found'));

    const { result } = renderHook(() => useFeedbackDetail(MOCK_TOKEN, 'nonexistent'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('API error 404');
    expect(result.current.feedback).toBeNull();
  });

  it('refresh() triggers a new API call', async () => {
    mockGetFeedback.mockResolvedValue({ data: MOCK_FEEDBACK_ITEM, comments: [] });

    const { result } = renderHook(() => useFeedbackDetail(MOCK_TOKEN, 'fb-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockGetFeedback).toHaveBeenCalledTimes(2);
    });
  });

  it('feedback state does not contain relations or notes', async () => {
    mockGetFeedback.mockResolvedValueOnce({ data: MOCK_FEEDBACK_ITEM, comments: [] });

    const { result } = renderHook(() => useFeedbackDetail(MOCK_TOKEN, 'fb-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const serialized = JSON.stringify(result.current.feedback);
    expect(serialized).not.toContain('"relations"');
    expect(serialized).not.toContain('"notes"');
  });
});
