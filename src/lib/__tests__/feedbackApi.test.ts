// @vitest-environment jsdom
/**
 * Unit tests — feedbackApi.ts
 *
 * Tests all exported functions by mocking globalThis.fetch.
 * Verifies: correct Authorization header, correct HTTP methods,
 * correct request bodies, correct URL paths, error propagation.
 *
 * LGPD: `relations` and `notes` must never appear in request payloads.
 * Restrição clínica: no clinical terms in any test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listFeedback,
  getFeedback,
  createFeedback,
  addComment,
  approveFeedback,
  rejectFeedback,
  markDeployed,
  finalApproveFeedback,
} from '../feedbackApi';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const MOCK_TOKEN = 'mock.valid.jwt.token';

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── listFeedback ─────────────────────────────────────────────────────────────

describe('listFeedback', () => {
  it('sends GET request with Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [], total: 0 }));

    await listFeedback(MOCK_TOKEN);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain('/api/feedback');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
  });

  it('passes category query param when provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [], total: 0 }));

    await listFeedback(MOCK_TOKEN, { category: 'bug' });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('category=bug');
  });

  it('passes limit query param when provided', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [], total: 0 }));

    await listFeedback(MOCK_TOKEN, { limit: 5 });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('limit=5');
  });

  it('returns parsed response data', async () => {
    const mockData = { data: [{ id: 'fb-1', title: 'Teste' }], total: 1 };
    mockFetch.mockResolvedValueOnce(mockResponse(mockData));

    const result = await listFeedback(MOCK_TOKEN);

    expect(result).toEqual(mockData);
  });

  it('throws error when API returns 401', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(listFeedback(MOCK_TOKEN)).rejects.toThrow('API error 401');
  });

  it('does not include relations or notes in request URL', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: [], total: 0 }));

    await listFeedback(MOCK_TOKEN);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('relations');
    expect(url).not.toContain('notes');
  });
});

// ─── getFeedback ──────────────────────────────────────────────────────────────

describe('getFeedback', () => {
  it('sends GET request to /api/feedback/:id', async () => {
    const mockData = { data: { id: 'fb-001', title: 'Erro' }, comments: [] };
    mockFetch.mockResolvedValueOnce(mockResponse(mockData));

    await getFeedback(MOCK_TOKEN, 'fb-001');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain('/api/feedback/fb-001');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
  });

  it('returns feedback and comments', async () => {
    const mockData = {
      data: { id: 'fb-001', title: 'Problema' },
      comments: [{ id: 'c-001', content: 'Concordo.' }],
    };
    mockFetch.mockResolvedValueOnce(mockResponse(mockData));

    const result = await getFeedback(MOCK_TOKEN, 'fb-001');

    expect(result.data).toBeDefined();
    expect(result.comments).toHaveLength(1);
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(getFeedback(MOCK_TOKEN, 'nonexistent')).rejects.toThrow('API error 404');
  });
});

// ─── createFeedback ───────────────────────────────────────────────────────────

describe('createFeedback', () => {
  it('sends POST with correct payload and Content-Type', async () => {
    const createdItem = { data: { id: 'new-001', status: 'pending_triage' } };
    mockFetch.mockResolvedValueOnce(mockResponse(createdItem, 201));

    await createFeedback(MOCK_TOKEN, {
      category: 'feature',
      title: 'Nova funcionalidade',
      content: 'Detalhe da funcionalidade solicitada pelo usuario.',
    });

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
    expect(url).toContain('/api/feedback');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const requestBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(requestBody).toHaveProperty('category', 'feature');
    expect(requestBody).toHaveProperty('title', 'Nova funcionalidade');
    expect(requestBody).toHaveProperty('content');
  });

  it('request body does not contain relations or notes fields', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'new-001' } }, 201));

    await createFeedback(MOCK_TOKEN, {
      category: 'bug',
      title: 'Erro no formulario',
      content: 'O formulario nao salva os dados corretamente.',
    });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    const requestBody = opts.body as string;
    expect(requestBody).not.toContain('relations');
    expect(requestBody).not.toContain('notes');
  });

  it('throws on 500 API error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

    await expect(
      createFeedback(MOCK_TOKEN, {
        category: 'bug',
        title: 'Titulo valido',
        content: 'Conteudo valido com pelo menos dez caracteres.',
      })
    ).rejects.toThrow('API error 500');
  });
});

// ─── addComment ───────────────────────────────────────────────────────────────

describe('addComment', () => {
  it('sends POST to /api/feedback/:feedbackId/comments', async () => {
    const mockResult = { data: { id: 'c-002', content: 'Novo comentario.' } };
    mockFetch.mockResolvedValueOnce(mockResponse(mockResult, 201));

    await addComment(MOCK_TOKEN, 'fb-001', 'Novo comentario.');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toContain('/api/feedback/fb-001/comments');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('content', 'Novo comentario.');
  });

  it('includes feedbackId in the URL path', async () => {
    const specificId = 'feedback-specific-id-123';
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'c-003' } }, 201));

    await addComment(MOCK_TOKEN, specificId, 'Comentario de teste.');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(specificId);
  });
});

// ─── approveFeedback ──────────────────────────────────────────────────────────

describe('approveFeedback', () => {
  it('sends POST to /api/feedback/:id/approve with approval_note in body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'fb-001' } }));

    await approveFeedback(MOCK_TOKEN, 'fb-001', 'Aprovado com ressalvas.');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toContain('/api/feedback/fb-001/approve');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('approval_note', 'Aprovado com ressalvas.');
  });

  it('sends empty approval_note when note is omitted', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'fb-001' } }));

    await approveFeedback(MOCK_TOKEN, 'fb-001');

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('approval_note', '');
  });
});

// ─── rejectFeedback ───────────────────────────────────────────────────────────

describe('rejectFeedback', () => {
  it('sends POST to /api/feedback/:id/reject with rejection_reason', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'fb-001' } }));

    await rejectFeedback(MOCK_TOKEN, 'fb-001', 'Fora do escopo atual.');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toContain('/api/feedback/fb-001/reject');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty('rejection_reason', 'Fora do escopo atual.');
  });

  it('throws when API returns 500', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    await expect(rejectFeedback(MOCK_TOKEN, 'fb-001', 'Motivo')).rejects.toThrow('API error 500');
  });
});

// ─── markDeployed ─────────────────────────────────────────────────────────────

describe('markDeployed', () => {
  it('sends POST to /api/feedback/:id/deploy', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'fb-001' } }));

    await markDeployed(MOCK_TOKEN, 'fb-001');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/feedback/fb-001/deploy');
    expect(opts.method).toBe('POST');
  });
});

// ─── finalApproveFeedback ─────────────────────────────────────────────────────

describe('finalApproveFeedback', () => {
  it('sends POST to /api/feedback/:id/final-approve', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { id: 'fb-001' } }));

    await finalApproveFeedback(MOCK_TOKEN, 'fb-001');

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/feedback/fb-001/final-approve');
    expect(opts.method).toBe('POST');
  });

  it('throws when API returns 400', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));

    await expect(finalApproveFeedback(MOCK_TOKEN, 'fb-001')).rejects.toThrow('API error 400');
  });
});
