/**
 * feedbackApi.ts — funções de acesso à API de feedback comunitário.
 *
 * Todas as funções:
 *  - Fazem fetch para VITE_API_URL + /api/feedback/...
 *  - Incluem Authorization: Bearer token no header
 *  - Retornam response.json() ou lançam erro com mensagem descritiva
 *
 * Restrição clínica: este módulo NUNCA interpreta ciclos como fértil/infértil.
 * LGPD: o campo `relations` nunca aparece aqui.
 */

import type { FeedbackCategory, FeedbackComment, FeedbackItem } from '../types/feedback';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface ListFeedbackParams {
  category?: FeedbackCategory;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListFeedbackResponse {
  data: FeedbackItem[];
  total: number;
}

export async function listFeedback(
  token: string,
  params?: ListFeedbackParams,
): Promise<ListFeedbackResponse> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit !== null && params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== null && params?.offset !== undefined) qs.set('offset', String(params.offset));

  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/feedback${query}`, {
    headers: authHeaders(token),
  });
  return handleResponse<ListFeedbackResponse>(res);
}

export interface GetFeedbackResponse {
  data: FeedbackItem;
  comments: FeedbackComment[];
}

export async function getFeedback(
  token: string,
  id: string,
): Promise<GetFeedbackResponse> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}`, {
    headers: authHeaders(token),
  });
  return handleResponse<GetFeedbackResponse>(res);
}

export interface CreateFeedbackData {
  category: FeedbackCategory;
  title: string;
  content: string;
}

export async function createFeedback(
  token: string,
  data: CreateFeedbackData,
): Promise<{ data: FeedbackItem }> {
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<{ data: FeedbackItem }>(res);
}

export async function addComment(
  token: string,
  feedbackId: string,
  content: string,
): Promise<{ data: FeedbackComment }> {
  const res = await fetch(`${API_BASE}/api/feedback/${feedbackId}/comments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  });
  return handleResponse<{ data: FeedbackComment }>(res);
}

export async function approveFeedback(
  token: string,
  id: string,
  note?: string,
): Promise<{ data: FeedbackItem }> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ approval_note: note ?? '' }),
  });
  return handleResponse<{ data: FeedbackItem }>(res);
}

export async function rejectFeedback(
  token: string,
  id: string,
  reason: string,
): Promise<{ data: FeedbackItem }> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ rejection_reason: reason }),
  });
  return handleResponse<{ data: FeedbackItem }>(res);
}

export async function markDeployed(
  token: string,
  id: string,
): Promise<{ data: FeedbackItem }> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/deploy`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<{ data: FeedbackItem }>(res);
}

export async function finalApproveFeedback(
  token: string,
  id: string,
): Promise<{ data: FeedbackItem }> {
  const res = await fetch(`${API_BASE}/api/feedback/${id}/final-approve`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return handleResponse<{ data: FeedbackItem }>(res);
}
