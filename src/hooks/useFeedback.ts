/**
 * useFeedback — hooks para o sistema de feedback comunitário (billings-mob).
 *
 * useListFeedback(token): lista de feedbacks com Realtime Supabase.
 * useFeedbackDetail(token, feedbackId): detalhe de um feedback + comentários.
 *
 * Restrição clínica: NUNCA interpreta ciclos como fértil/infértil.
 * LGPD: o campo `relations` nunca aparece aqui.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listFeedback, getFeedback } from '../lib/feedbackApi';
import type { FeedbackComment, FeedbackItem } from '../types/feedback';
import type { ListFeedbackParams } from '../lib/feedbackApi';

// ── useListFeedback ──────────────────────────────────────────────────────────

export interface UseListFeedbackResult {
  items: FeedbackItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useListFeedback(
  token: string | null,
  params?: ListFeedbackParams,
): UseListFeedbackResult {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!token) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listFeedback(token, params);
      setItems(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, params?.category, params?.status, params?.limit, params?.offset]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Supabase Realtime: auto-refresh quando status muda em app_feedback
  useEffect(() => {
    if (!token) return;

    const channel = supabase
      .channel('feedback-list-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_feedback' },
        () => {
          void fetch();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [token, fetch]);

  return { items, loading, error, refresh: fetch };
}

// ── useFeedbackDetail ────────────────────────────────────────────────────────

export interface UseFeedbackDetailResult {
  feedback: FeedbackItem | null;
  comments: FeedbackComment[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useFeedbackDetail(
  token: string | null,
  feedbackId: string | null,
): UseFeedbackDetailResult {
  const [feedback, setFeedback] = useState<FeedbackItem | null>(null);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!token || !feedbackId) {
      setFeedback(null);
      setComments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getFeedback(token, feedbackId);
      setFeedback(res.data ?? null);
      setComments(res.comments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, feedbackId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { feedback, comments, loading, error, refresh: fetch };
}
